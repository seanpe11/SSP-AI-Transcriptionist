import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaFileAudio, FaPlay, FaPause, FaSave, FaPlus, FaTrash, FaPen, FaRegFileAlt, FaRegFileAudio, FaClipboard, FaFileDownload, FaInfoCircle } from 'react-icons/fa';
import { ChangeEvent } from 'react';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'


// const API_BASE_URL = 'http://localhost:8000';
// const API_BASE_URL = 'https://transcription-api-gpu-384958301784.us-central1.run.app';
const API_BASE_URL = 'https://ssp-whisper-worker.sean-m-s-pe.workers.dev';

type SubtitleEntry = {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number; // Added confidence field
  checked?: boolean;
};

interface JsonSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

interface TranscribeApiResponse {
  filename?: string;
  error?: string;
  job_id?: string;
  message?: string;
}

interface StatusApiResponse {
  id: string;
  status: "processing" | "complete" | "error";
  result: JsonTranscription | null;
  filename: string;
}

// This interface represents the overall structure of the JSON file.
interface JsonTranscription {
  text: string;
  segments: JsonSegment[];
  language?: string;
}


const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const parseTime = (timeString: string): number => {
  const [hms, ms] = timeString.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
};



const App: React.FC = () => {
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [transcriptionFileName, setTranscriptionFileName] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [waveform, setWaveform] = useState<HTMLCanvasElement | null>(null);
  const [duration, setDuration] = useState(0);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const transcriptionInputRef = useRef<HTMLInputElement>(null); // Renamed from srtInputRef
  const previousActiveSubtitleIdRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Register global shortcuts
  // registers the global shortcuts
  useEffect(() => {
    const registerShortcuts = async () => {
      const result = await unregisterAll();
      console.log("Registering global shortcuts...");
      await register(['Alt+A', 'Alt+S'], (event) => {
        console.log(`Shortcut ${event.shortcut} triggered`);
      });
    }

    registerShortcuts();
  }, []);



  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000); // Hide toast after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  // Parse JSON transcription file content
  const parseJsonTranscriptionFromFile = (content: string): SubtitleEntry[] => {
    try {
      const result = JSON.parse(content);
      const data: JsonTranscription = result.result;

      if (!data.segments || !Array.isArray(data.segments)) {
        console.error("Invalid JSON format: 'segments' array not found.");
        return [];
      }

      return data.segments.map(seg => ({
        id: seg.id,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text.trim(),
        confidence: seg.confidence,
      }));
    } catch (error) {
      console.error("Failed to parse JSON file:", error);
      setToastMessage("Invalid JSON file. Please check the file format and try again.");
      return [];
    }
  };

  const parseJsonTranscription = (result: JsonTranscription): SubtitleEntry[] => {
    try {
      return result.segments.map(seg => ({
        id: seg.id,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text.trim(),
        confidence: seg.confidence,
      }));
    } catch (error) {
      console.error("Failed to parse JSON response:", error);
      return [];
    }
  };

  // Generate SRT file content (for export)
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

  // Handle transcription file drop
  const onTranscriptionDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    loadNewTranscription(file);
  }, []);

  // Trigger file input click
  const triggerTranscriptionInputChange = () => {
    transcriptionInputRef.current?.click();
  };

  // Handle transcription file change from input
  const handleTranscriptionChange = (e: ChangeEvent<HTMLInputElement>) => {
    loadNewTranscription(e.target.files?.[0]);
  };

  // Load and process the new transcription file
  const loadNewTranscription = (file: File | null | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseJsonTranscriptionFromFile(content);
      setTranscriptionFileName(file.name);
      setSubtitles(parsed);
    };
    reader.readAsText(file);
  };


  // Handle audio file drop (uses loadNewAudio)
  const onAudioDrop = useCallback((acceptedFiles: File[]) => {
    loadNewAudio(acceptedFiles[0]);
  }, [audioSrc]);

  const startTranscriptionProcess = async (file: File) => {
    setIsTranscribing(true);
    const formData = new FormData();
    formData.append('audio_file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/transcribe`, {
        method: 'POST',
        body: formData,
      });

      const data: TranscribeApiResponse = await response.json();

      if (response.status === 202) { // Status 202 Accepted
        console.log("Transcription job accepted:", data.message);
        if (data.filename) {
          pollForStatus(data.filename);
        }
      } else if (response.status === 409) { // Status 409 Conflict
        console.log("Job already exists, fetching status for:", file.name);
        setToastMessage("Transcription job already exists, fetching status...");
        pollForStatus(file.name);
      } else {
        throw new Error(data.error || 'Failed to start transcription');
      }
    } catch (error: any) {
      console.error("Transcription initiation failed:", error);
      setToastMessage(`Error: ${error.message}`);
      setIsTranscribing(false);
    }
  };

  const pollForStatus = async (filename: string) => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/status/${filename}`);
        if (!response.ok) {
          if (response.status === 404) {
            console.log("Job not found yet, still polling...");
            return; // Continue polling
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: StatusApiResponse = await response.json();

        if (data.status === 'complete' && data.result) {
          clearInterval(intervalId);
          const parsed = parseJsonTranscription(data.result); // Use updated parser
          setSubtitles(parsed);
          setTranscriptionFileName(data.filename);
          setIsTranscribing(false);
          setToastMessage('Transcription complete!');
        } else if (data.status === 'error') {
          clearInterval(intervalId);
          setIsTranscribing(false);
          setToastMessage(`Transcription failed: ${data.result?.text || 'Unknown error'}`);
        }
        // If status is 'queued' or 'processing', do nothing and let the interval continue.
      } catch (error) {
        console.error("Polling error:", error);
        clearInterval(intervalId);
        setIsTranscribing(false);
        setToastMessage('An error occurred while checking the transcription status.');
      }
    }, 3000); // Poll every 3 seconds
  };

  const triggerAudioInputChange = () => {
    audioInputRef.current?.click();
  };

  // Handle audio file change via input (uses loadNewAudio)
  const handleAudioChange = (e: ChangeEvent<HTMLInputElement>) => {
    loadNewAudio(e.target.files?.[0]);
    if (e.target) e.target.value = '';
  };

  const loadNewAudio = (file: File | null | undefined) => {
    if (!file) return;

    if (audioSrc) {
      URL.revokeObjectURL(audioSrc);
    }

    const url = URL.createObjectURL(file);

    // Reset state for the new audio file
    setSubtitles([]);
    setTranscriptionFileName(null);
    if (audioRef.current) audioRef.current.currentTime = 0;
    setCurrentTime(0);

    setAudioFile(file);
    setAudioFileName(file.name);
    setAudioSrc(url);

    // Automatically start the transcription process
    startTranscriptionProcess(file);
  }

  // Setup subtitle and audio dropzones
  const {
    getRootProps: getSubtitleRootProps,
    getInputProps: getSubtitleInputProps,
  } = useDropzone({
    onDrop: onTranscriptionDrop,
    accept: { 'application/json': ['.json'] }, // Accept JSON files
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

  // Memoized sorted subtitles
  const sortedSubtitles = useMemo(() => {
    return [...subtitles].sort((a, b) => a.startTime - b.startTime);
  }, [subtitles]);

  const sortedSubtitlesRef = useRef<SubtitleEntry[]>([]);
  useEffect(() => {
    sortedSubtitlesRef.current = sortedSubtitles;
  }, [sortedSubtitles]);

  // Update audio time display and waveform position
  const updateTimeDisplay = useCallback(() => {
    if (audioRef.current) {
      const newCurrentTime = audioRef.current.currentTime;
      setCurrentTime(newCurrentTime);

      // Use the ref to get the LATEST sorted subtitles
      const currentSubtitles = sortedSubtitlesRef.current;
      // --- Add this console.log ---
      if (currentSubtitles.length > 0) {
        console.log(
          `Current Time: ${newCurrentTime.toFixed(2)} | First Subtitle Start: ${currentSubtitles[0].startTime.toFixed(2)} | First Subtitle End: ${currentSubtitles[0].endTime.toFixed(2)}`
        );
      }

      const currentSubtitle = currentSubtitles.find(
        sub => newCurrentTime >= sub.startTime && newCurrentTime <= sub.endTime
      );

      if (currentSubtitle) {
        const subtitleIndex = currentSubtitles.findIndex(s => s.id === currentSubtitle.id);
        // Use a functional state update to avoid dependency on currentEditIndex
        setCurrentEditIndex(prevIndex => {
          if (prevIndex !== subtitleIndex) {
            console.log("Setting new index:", subtitleIndex); // You should see this log now
            return subtitleIndex;
          }
          return prevIndex;
        });
      } else {
        setCurrentEditIndex(null);
      }

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(updateTimeDisplay);
      }
    }
  }, [isPlaying]); // The dependency array is now much simpler and more stable

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


  const colorForConfidence = (confidence: number | undefined) => {
    if (confidence === undefined) return 'text-gray-500';
    if (confidence < 0.5) return 'text-red-500';
    if (confidence < 0.75) return 'text-yellow-500';
    return 'text-green-500';
  };

  const uploadTranscriptionAudio = async () => {
    const formData = new FormData();
    console.log("Uploading audio file...");
    if (!audioFile) return;
    formData.append('audio_file', audioFile);

    const response = await fetch('http://localhost:8000/transcribe/', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    console.log(data);
  };

  // Update subtitle text
  const updateSubtitleText = (id: number, text: string) => {
    setSubtitles(
      subtitles.map(sub => sub.id === id ? { ...sub, text, checked: true } : sub)
    );
  };

  const markSubtitleChecked = (id: number, checked: boolean) => {
    setSubtitles(
      subtitles.map(sub => sub.id === id ? { ...sub, checked } : sub)
    );
  };


  const copyRaw = (subtitles: SubtitleEntry[]) => {
    return subtitles
      .map(sub => `${sub.text.trim()}`)
      .join(' ');
  };
  // Function to copy segment content to clipboard
  const copySRTToClipboard = () => {
    // const content = generateSRT();
    const content = copyRaw(subtitles);
    navigator.clipboard.writeText(content).then(() => {
      setToastMessage('Full transcription copied to clipboard!');
    }, (err) => {
      console.error('Could not copy text: ', err);
      setToastMessage('Failed to copy SRT content.');
    });
  };

  const copySegmentToClipboard = (subtitle: SubtitleEntry) => {
    const content = copyRaw([subtitle]);
    navigator.clipboard.writeText(content).then(() => {
      setToastMessage('Segment copied to clipboard!');
    }, (err) => {
      console.error('Could not copy text: ', err);
      setToastMessage('Failed to copy SRT content.');
    });
  };

  // Function to download the SRT file
  const downloadSRT = () => {
    const content = generateSRT();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = transcriptionFileName ? `${transcriptionFileName.split('.')[0]}.srt` : 'subtitles.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Auto-scroll to the active subtitle
  useEffect(() => {
    if (autoScroll && currentEditIndex !== null && tableBodyRef.current) {
      const activeRow = tableBodyRef.current.children[currentEditIndex] as HTMLTableRowElement;
      if (activeRow) {
        activeRow.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentEditIndex, autoScroll]);

  // Set current time from waveform click
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!waveformRef.current || duration === 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTimeRatio = x / rect.width;
    const newTime = clickTimeRatio * duration;
    jumpToTime(newTime);
  };

  const Spinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-600 font-medium">Transcription in progress, please wait...</p>
    </div>
  );

  const Toast: React.FC<{ message: string }> = ({ message }) => (
    <div className="fixed bottom-5 right-5 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
      {message}
    </div>
  );

  return (
    <div className="max-h-screen min-h-screen bg-gray-100">
      {toastMessage && <Toast message={toastMessage} />}
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">SSP Transcription Editor</h1>
        </div>

        <div className="p-6 relative">
          <div className="mt-0 mb-2 border rounded-lg overflow-hidden">
            {(audioSrc && subtitles.length > 0) && (
              <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3 flex-shrink min-w-0">
                  {transcriptionFileName ? (
                    <p className="text-sm text-gray-700 truncate" title={transcriptionFileName}>
                      <strong className="font-medium">{transcriptionFileName}</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No file loaded</p>
                  )}
                  {/*
                  <button
                    onClick={triggerTranscriptionInputChange}
                    className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                    title="Load different Transcription File"
                  >
                    <FaRegFileAlt className="h-5 w-5" />
                  </button>
                  <input
                    id="change-transcription-input"
                    type="file"
                    accept=".json" // Accept JSON
                    onChange={handleTranscriptionChange}
                    ref={transcriptionInputRef}
                    className="hidden"
                  />
                  */}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {!subtitles.every(sub => sub.checked) &&
                    <p className="text-sm text-gray-500">
                      <FaInfoCircle className="h-4 w-4 text-yellow-500" />
                      Unchecked segments!
                    </p>
                  }
                  <button
                    onClick={copySRTToClipboard}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                  >
                    <FaClipboard className="h-4 w-4" />
                    Copy Text
                  </button>
                </div>
              </div>
            )}

            {subtitles.length > 0 ? (
              <div className="overflow-y-auto h-[32rem] flex-grow">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Text</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Checked</th>
                    </tr>
                  </thead>
                  <tbody ref={tableBodyRef} className="bg-white divide-y divide-gray-200">
                    {sortedSubtitles.map((subtitle) => (
                      <tr
                        key={subtitle.id}
                        className={`${currentTime >= subtitle.startTime && currentTime <= subtitle.endTime ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-6 py-4 w-1/5 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <button onClick={() => { jumpToTime(subtitle.startTime); setIsPlaying(true) }} className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors" title="Jump to time"><FaPlay className="w-3 h-3" /></button>
                            <span className="font-mono">{formatTime(subtitle.startTime)}</span>
                            <span className="text-gray-500">Confidence:</span>
                            <span
                              className={`${colorForConfidence(subtitle.confidence)} font-mono`}
                            >{subtitle.confidence !== undefined ? `${(subtitle.confidence * 100).toFixed(0)}%` : 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 w-3/5 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <textarea
                              value={subtitle.text}
                              onChange={(e) => updateSubtitleText(subtitle.id, e.target.value)}
                              // @ts-ignore
                              style={{ fieldSizing: 'content' }}
                              className="flex-grow border rounded px-3 py-2 min-h-[60px] text-sm font-mono bg-gray-20 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:text-black text-grey-500 resize-none"
                              placeholder="Enter subtitle text..."
                            />
                            <button
                              onClick={() => copySegmentToClipboard(subtitle)}
                              className="inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                              title="Copy segment text"
                            >
                              <FaClipboard className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 w-1/5 text-sm text-gray-500 items-center justify-center">
                          <input type="checkbox" checked={subtitle.checked} onChange={() => markSubtitleChecked(subtitle.id, !subtitle.checked)} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center p-12 bg-gray-50 rounded-lg border-t border-gray-200">
                <div
                  {...getSubtitleRootProps()}
                  className="border-2 border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-gray-50"
                >
                  <input {...getSubtitleInputProps()} disabled={!audioSrc} />
                  {isTranscribing ? (
                    <Spinner />
                  ) : (
                    <p className="text-center text-gray-600">
                      {audioSrc
                        ? 'Or, you can drop a JSON transcription file here.'
                        : 'Upload an audio file to begin.'
                      }
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          {audioSrc ? (
            <div className="mb-8 p-3 border rounded-md bg-gray-50 shadow-sm">
              {/* Audio Player & Waveform */}
              <div className="mb-4 flex gap-3 items-center justify-between">
                <div className="flex items-center gap-3 flex-shrink min-w-0">
                  {audioFileName && (
                    <p className="mt-2 text-xs text-gray-600">
                      <strong>{audioFileName}</strong>
                    </p>
                  )}
                  <button
                    onClick={triggerAudioInputChange}
                    className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                    title="Load different Audio File"
                  >
                    <FaRegFileAudio className="h-5 w-5" />
                  </button>
                  <input
                    id="change-audio-input"
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioChange}
                    ref={audioInputRef}
                    className="hidden"
                  />
                </div>
                <div className="flex items-center gap-3 flex-shrink min-w-0">
                  Auto-Scroll <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
                </div>
              </div>

              <div className="mb-4 relative">
                <canvas
                  ref={waveformRef}
                  width="1200" // Set a fixed width for better rendering quality
                  height="96"
                  className="w-full h-24 bg-gray-100 rounded cursor-pointer"
                  onClick={handleWaveformClick}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-blue-500 border-1 border-grey-500 pointer-events-none"
                  style={{
                    left: `${(currentTime / duration) * 100}%`,
                    display: duration > 0 ? 'block' : 'none'
                  }}
                />
                {sortedSubtitles.map(sub => (
                  <React.Fragment key={`marker-${sub.startTime}`}>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-500 opacity-50"
                      style={{ left: `${(sub.startTime / duration) * 100}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-500 opacity-50"
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

                <div className="text-lg font-mono text-gray-700">
                  {formatTime(currentTime)}
                </div>

                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  />
                </div>

                <div className="text-lg font-mono text-gray-500">
                  {formatTime(duration)}
                </div>
              </div>
            </div>
          ) : (
            <div
              {...getAudioRootProps()}
              className="border-2 border-gray-300 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-gray-50"
            >
              <input {...getAudioInputProps()} />
              <FaFileAudio className="text-4xl text-blue-500 mb-3" />
              <p className="text-center text-gray-600">
                Drag & drop or click to select an audio file
              </p>
            </div>
          )}
        </div>
      </div>
    </div >
  );
};

export default App;
