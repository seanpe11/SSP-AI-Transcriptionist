import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaFileAudio, FaPlay, FaPause, FaSave, FaPlus, FaTrash, FaPen, FaRegFileAlt, FaRegFileAudio, FaClipboard, FaFileDownload } from 'react-icons/fa';
import { ChangeEvent } from 'react';

type SubtitleEntry = {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  dirty?: boolean;
};

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

const parseTime = (timeString: string): number => {
  const [hms, ms] = timeString.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
};

const App: React.FC = () => {
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [srtFileName, setSrtFileName] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [waveform, setWaveform] = useState<HTMLCanvasElement | null>(null);
  const [duration, setDuration] = useState(0);
  const audioInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden file input
  const srtInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden file input
  const previousActiveSubtitleIdRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Parse SRT file content
  const parseSRT = (content: string): SubtitleEntry[] => {
    const entries: SubtitleEntry[] = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      const id = parseInt(lines[0]);
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);

      if (!timeMatch) continue;

      const startTime = parseTime(timeMatch[1]);
      const endTime = parseTime(timeMatch[2]);
      const text = lines.slice(2).join('\n');

      entries.push({ id, startTime, endTime, text });
    }

    return entries.sort((a, b) => a.startTime - b.startTime);
  };

  // Generate SRT file content
  const generateSRT = (): string => {
    return subtitles
      .sort((a, b) => a.startTime - b.startTime)
      .map((entry, index) => {
        const newId = index + 1;
        const startTime = formatTime(entry.startTime);
        const endTime = formatTime(entry.endTime);
        return `${newId}\n${startTime} --> ${endTime}\n${entry.text}`;
      })
      .join('\n\n');
  };

  // Handle subtitle file drop
  const onSubtitleDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    loadNewSrt(file);
  }, []);

  // Handle SRT file change
  const triggerSrtInputChange = () => {
    srtInputRef.current?.click();
  };

  const handleSrtChange = (e: ChangeEvent<HTMLInputElement>) => {
    loadNewSrt(e.target.files?.[0]);
  };

  const loadNewSrt = (file: File | null | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseSRT(content);
      setSrtFileName(file.name);
      setSubtitles(parsed);
    };
    reader.readAsText(file);
  };


  // Handle audio file drop (uses loadNewAudio)
  const onAudioDrop = useCallback((acceptedFiles: File[]) => {
    loadNewAudio(acceptedFiles[0]);
    // Add audioSrc dependency because loadNewAudio now accesses it for cleanup
  }, [audioSrc]); // <-- Make sure audioSrc is a dependency

  const triggerAudioInputChange = () => {
    audioInputRef.current?.click();
  };

  // Handle audio file change via input (uses loadNewAudio)
  const handleAudioChange = (e: ChangeEvent<HTMLInputElement>) => {
    loadNewAudio(e.target.files?.[0]);
    // Reset the input value so the same file can be selected again if needed
    if (e.target) e.target.value = '';
  };

  const loadNewAudio = (file: File | null | undefined) => {
    if (!file) return;

    // Revoke the previous object URL if it exists
    if (audioSrc) {
      URL.revokeObjectURL(audioSrc);
      console.log("Revoked previous audio URL:", audioSrc); // Debugging
    }

    const url = URL.createObjectURL(file);
    console.log("Created new audio URL:", url); // Debugging
    setAudioFileName(file.name);
    setAudioSrc(url); // Set the new source
  }


  // Setup subtitle and audio dropzones
  const {
    getRootProps: getSubtitleRootProps,
    getInputProps: getSubtitleInputProps,
  } = useDropzone({
    onDrop: onSubtitleDrop,
    accept: { 'text/srt': ['.srt'] },
    multiple: false,
  });

  const {
    getRootProps: getAudioRootProps,
    getInputProps: getAudioInputProps,
  } = useDropzone({
    onDrop: onAudioDrop,
    accept: { 'audio/*': [] },
    multiple: false,
  });

  // Draw waveform
  useEffect(() => {
    if (!audioSrc || !waveformRef.current) return;

    const canvas = waveformRef.current;
    setWaveform(canvas);

    const audio = new Audio(audioSrc);
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);

      const context = new AudioContext();
      fetch(audioSrc)
        .then(response => response.arrayBuffer())
        .then(buffer => context.decodeAudioData(buffer))
        .then(audioBuffer => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Clear canvas
          ctx.fillStyle = '#f3f4f6';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const data = audioBuffer.getChannelData(0);
          const step = Math.ceil(data.length / canvas.width);
          const amp = canvas.height / 2;

          ctx.fillStyle = '#60a5fa';

          for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
              const datum = data[(i * step) + j];
              if (datum < min) min = datum;
              if (datum > max) max = datum;
            }

            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
          }
        });
    });
  }, [audioSrc]);

  // Update audio time display and waveform position
  const updateTimeDisplay = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);

      // Find current subtitle
      const currentSubtitle = subtitles.find(
        sub => audioRef.current!.currentTime >= sub.startTime && audioRef.current!.currentTime <= sub.endTime
      );

      if (currentSubtitle && currentEditIndex !== currentSubtitle.id - 1) {
        setCurrentEditIndex(currentSubtitle.id - 1);
      }

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(updateTimeDisplay);
      }
    }
  }, [isPlaying, subtitles, currentEditIndex]);

  // Handle play/pause
  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play();
      animationRef.current = requestAnimationFrame(updateTimeDisplay);
    } else {
      audioRef.current?.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, updateTimeDisplay]);

  // Jump to a specific time
  const jumpToTime = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Memorized sorted subtitles
  const sortedSubtitles = useMemo(() => {
    return [...subtitles].sort((a, b) => a.startTime - b.startTime);
  }, [subtitles]);


  // Add a new subtitle entry
  const addSubtitle = () => {
    const currentPos = audioRef.current?.currentTime || 0;
    const newId = subtitles.length > 0 ? Math.max(...subtitles.map(s => s.id)) + 1 : 1;

    const newEntry: SubtitleEntry = {
      id: newId,
      startTime: currentPos,
      endTime: currentPos + 3,
      text: '',
      dirty: true
    };

    setSubtitles([...subtitles, newEntry]);
    setCurrentEditIndex(subtitles.length);
  };

  // Delete a subtitle entry
  const deleteSubtitle = (id: number) => {
    setSubtitles(subtitles.filter(sub => sub.id !== id));
    setCurrentEditIndex(null);
  };

  // Update subtitle text
  const updateSubtitleText = (id: number, text: string) => {
    setSubtitles(
      subtitles.map(sub => sub.id === id ? { ...sub, text, dirty: true } : sub)
    );
  };

  // Update subtitle timing
  const updateSubtitleTiming = (id: number, field: 'startTime' | 'endTime', value: number) => {
    setSubtitles(
      subtitles.map(sub => sub.id === id ? { ...sub, [field]: value, dirty: true } : sub)
    );
  };

  // Save SRT file
  const saveSRT = () => {
    const content = generateSRT();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Set current time from waveform click
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!waveformRef.current || duration === 0) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTimeRatio = x / rect.width;
    const newTime = clickTimeRatio * duration;

    jumpToTime(newTime);
  };


  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">SRT File Editor</h1>
        </div>

        <div className="p-6">
          {audioSrc ? (
            <div className="mb-8 p-3 border rounded-md bg-gray-50 shadow-sm">
              {/* Audio Player & Waveform */}
              <div className="mb-4 flex gap-3">
                {audioFileName && (
                  <p className="mt-2 text-xs text-gray-600">
                    <strong>{audioFileName}</strong>
                  </p>
                )}

                {/* Change SRT Button */}
                <button
                  onClick={triggerAudioInputChange} // Assumes this function exists
                  className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                  title="Load different SRT File"
                >
                  <FaRegFileAudio className="h-5 w-5" />
                </button>


                {/* Hidden File Input - controlled by the button */}
                <input
                  id="change-audio-input" // ID can remain for potential label use
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioChange} // Your existing handler
                  ref={audioInputRef}         // Connect the ref
                  className="hidden"          // Make it invisible
                />
              </div>

              <div className="mb-4 relative">
                <canvas
                  ref={waveformRef}
                  className="w-full h-24 bg-gray-100 rounded cursor-pointer"
                  onClick={handleWaveformClick}
                />
                {/* Current position indicator */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-blue-500 border-1 border-grey-500 pointer-events-none"
                  style={{
                    left: `${(currentTime / duration) * 100}%`,
                    display: duration > 0 ? 'block' : 'none'
                  }}
                />

                {/* Subtitle markers */}
                {sortedSubtitles.map(sub => (
                  <React.Fragment key={`marker-${sub.id}`}>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-green-500 opacity-50"
                      style={{ left: `${(sub.startTime / duration) * 100}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 opacity-50"
                      style={{ left: `${(sub.endTime / duration) * 100}%` }}
                    />
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center space-x-4 mb-4">
                <audio ref={audioRef} src={audioSrc} className="hidden" />

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </button>

                <div className="text-lg font-mono">
                  {formatTime(currentTime)}
                </div>

                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  />
                </div>

                <div className="text-lg font-mono">
                  {formatTime(duration)}
                </div>
              </div>
            </div>
          ) : (
            < div
              {...getAudioRootProps()}
              className={`border-2 ${audioSrc ? 'border-blue-400 bg-blue-50' : 'border-gray-300 border-dashed'} rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-gray-50`}
            >
              <input {...getAudioInputProps()} />
              <FaFileAudio className="text-4xl text-blue-500 mb-3" />
              <p className="text-center text-gray-600">
                {audioSrc ? "Audio file loaded! Click to replace." : "Drag & drop or click to select audio file"}
              </p>
            </div>
          )}


          {/* --- Subtitle Editor OR Subtitle Upload Dropzone section starts below --- */}
          <div className="mt-6 border rounded-lg overflow-scroll">
            {/* === Combined Actions Bar === */}
            {(audioSrc && subtitles.length > 0) && (
              <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 mb-6 px-6 pt-6 border-t border-gray-200 ">

                {/* --- Left Side Group (SRT Info & Change Button) --- */}
                <div className="flex items-center gap-3 flex-shrink min-w-0"> {/* Group for left items, allows shrinking */}
                  {srtFileName ? (
                    <p className="text-sm text-gray-700 truncate" title={srtFileName}>
                      <strong className="font-medium">{srtFileName}</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No SRT loaded</p> // Placeholder
                  )}

                  {/* Change SRT Button */}
                  <button
                    onClick={triggerSrtInputChange}
                    className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                    title="Load different SRT File"
                  >
                    <FaRegFileAlt className="h-5 w-5" />
                  </button>

                  {/* Hidden SRT File Input */}
                  <input
                    id="change-srt-input"
                    type="file"
                    accept=".srt" // Use .srt extension filter
                    onChange={handleSrtChange}
                    ref={srtInputRef}
                    className="hidden"
                  />
                </div>


                {/* --- Right Side Group (Add & Save Buttons) --- */}
                <div className="flex items-center gap-3 flex-shrink-0"> {/* Group for right items, prevents shrinking */}
                  <button
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                  >
                    <FaClipboard className="h-5 w-5" />
                    Copy to clipboard
                  </button>

                  <button
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <FaFileDownload className="h-5 w-5" />
                    Download
                  </button>
                  {/* Add Subtitle Button */}
                  <button
                    onClick={addSubtitle}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                  // Removed redundant disabled={!audioSrc}
                  >
                    <FaPlus className="-ml-1 mr-2 h-5 w-5" />
                    Add Subtitle
                  </button>

                  {/* Save SRT Button */}
                  <button
                    onClick={saveSRT}
                    disabled={subtitles.length === 0} // Keep this check
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaSave className="-ml-1 mr-2 h-5 w-5" />
                    Save SRT
                  </button>
                </div>
                {/* --- End Right Side Group --- */}

              </div>
            )}


            {/* === SUBTITLE ROWS === */}
            {subtitles.length > 0 ? (
              <div className="overflow-y-auto h-96 flex-grow"> {/* ADDED scrollable wrapper with height */}
                <table className="min-w-full divide-y divide-gray-200">
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedSubtitles.map((subtitle, index) => (
                      <tr
                        key={subtitle.id}
                        className={`${currentTime >= subtitle.startTime && currentTime <= subtitle.endTime ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <p>{formatTime(subtitle.startTime)}</p>
                            <button
                              onClick={() => updateSubtitleTiming(subtitle.id, 'startTime', currentTime)}
                              className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                              title="Set to current time"
                            >
                              <FaPen className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => jumpToTime(subtitle.startTime)}
                              className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                              title="Jump to time"
                            >
                              <FaPlay className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <p>{formatTime(subtitle.endTime)}</p>
                            <button
                              onClick={() => updateSubtitleTiming(subtitle.id, 'endTime', currentTime)}
                              className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                              title="Set to current time"
                            >
                              <FaPen className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => jumpToTime(subtitle.endTime)}
                              className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                              title="Jump to time"
                            >
                              <FaPlay className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <textarea
                            value={subtitle.text}
                            onChange={(e) => updateSubtitleText(subtitle.id, e.target.value)}
                            className="border rounded px-3 py-2 w-full min-h-[60px]"
                            placeholder="Enter subtitle text..."
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => deleteSubtitle(subtitle.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center p-12 bg-gray-50 rounded-lg border border-gray-200">
                {/* Subtitle Upload */}
                <div
                  {...getSubtitleRootProps()}
                  className={`border-2 ${subtitles.length > 0 ? 'border-green-400 bg-green-50' : 'border-gray-300 border-dashed'} rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-gray-50`}
                >
                  <input {...getSubtitleInputProps()} />
                  <FaRegFileAlt className="text-4xl text-green-500 mb-3" />
                  <p className="text-center text-gray-600">
                    {subtitles.length > 0 ? `${subtitles.length} subtitles loaded! Click to replace.` : "Drag & drop or click to select SRT file"}
                  </p>
                </div>

                {/* No srt file loaded */}
                <div
                  className="text-center pt-6 bg-gray-50"
                >
                  <p>Or start from scratch
                    <button onClick={addSubtitle}
                      className="mx-2 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                      <FaPlus className="h-3 w-3" />
                    </button>
                  </p>
                </div>
              </div>

            )}
          </div>
        </div>
      </div>
    </div >
  );
};

export default App;
