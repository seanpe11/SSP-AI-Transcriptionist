import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaFileAudio, FaPlay, FaPause, FaRegFileAudio, FaClipboard, FaTable, FaParagraph, FaInfoCircle } from 'react-icons/fa';
import { ChangeEvent } from 'react';
import { listen } from '@tauri-apps/api/event'
import { invoke } from "@tauri-apps/api/core"
import SubtitleTable from './components/SubtitleTable'
import SubtitleParagraph from './components/SubtitleParagraph'
import { SubtitleEntry } from './types'
import { useTranscription } from './hooks/useTranscription';

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const App: React.FC = () => {
  // let's keep visual state changes here
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isPedalConnected, setIsPedalConnected] = useState<boolean>(false);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const [viewMode, setViewMode] = useState<'table' | 'paragraph'>('paragraph');

  const {
    isTranscribing,
    subtitles,
    setSubtitles,
    transcriptionFileName, setTranscriptionFileName,
    startTranscriptionProcess,
    updateSubtitleText,
    markSubtitleChecked,
  } = useTranscription({ setToastMessage });

  // audio player state
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [_audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [_waveform, setWaveform] = useState<HTMLCanvasElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000); // Hide toast after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);


  // Handle audio file drop (uses loadNewAudio)
  const onAudioDrop = useCallback((acceptedFiles: File[]) => {
    loadNewAudio(acceptedFiles[0]);
  }, [audioSrc]);


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

      const currentSubtitle = sortedSubtitles.find(
        sub => newCurrentTime >= sub.startTime && newCurrentTime <= sub.endTime
      );

      if (currentSubtitle) {
        const subtitleIndex = sortedSubtitles.findIndex(s => s.startTime === currentSubtitle.startTime);
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
  }, [isPlaying, currentTime]);

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
      console.log(time)
      const found = sortedSubtitles.findIndex(s => s.startTime <= time && s.endTime >= time)
      setCurrentEditIndex(found);
    }
  };

  // PEDAL CONTROLS
  const currentEditIndexRef = useRef<number | null>(null);
  useEffect(() => { currentEditIndexRef.current = currentEditIndex }, [currentEditIndex]);
  // check pedal connection
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const connected = await invoke<boolean>('is_pedal_connected');
        if (connected) {
          setIsPedalConnected(true);
          console.log("Pedal was already connected on startup.");
        }
      } catch (e) {
        console.error("Error checking initial pedal status:", e);
      }
    };

    (async () => { await checkInitialStatus() })();

    const listenForPedalDetection = async () => {
      const unlisten = await listen<string>('pedal-found', () => {
        setIsPedalConnected(true);
      })
      return unlisten
    }



    const setupListener = async () => {
      const unlisten = await listen<string>('pedal-action', (event) => {
        const shortcut = event.payload;
        console.log(shortcut)
        switch (shortcut) {
          case 'left-pressed': {
            const currentIndex = currentEditIndexRef.current;
            const currentSubtitles = sortedSubtitlesRef.current;

            if (currentIndex !== null && audioRef.current) {
              // If we're at the start of a segment, jump to the previous one
              if (audioRef.current.currentTime <= currentSubtitles[currentIndex].startTime + 0.1 && currentIndex > 0) {
                jumpToTime(currentSubtitles[currentIndex - 1].startTime);
              } else if (currentIndex <= 0) {
                jumpToTime(0);
              } else {
                jumpToTime(currentSubtitles[currentIndex].startTime);
              }
            } else {
              // If no active segment, jump to the beginning
              jumpToTime(0);
            }
            break;
          }

          case 'center-pressed':
            setIsPlaying(true);
            break;

          case 'center-released':
            setIsPlaying(false);
            break;

          case 'right-pressed': {
            const currentIndex = currentEditIndexRef.current;
            const currentSubtitles = sortedSubtitlesRef.current;

            if (currentIndex !== null && currentIndex < currentSubtitles.length - 1) {
              console.log(`Current IDX: ${currentIndex}, moving to ${currentIndex + 1}, ${currentSubtitles[currentIndex].startTime}, ${currentSubtitles[currentIndex + 1].startTime}`)
              jumpToTime(currentSubtitles[currentIndex + 1].startTime);
              // @ts-ignore
              setCurrentEditIndex((prev) => prev + 1);
            }
            break;
          }

          default:
            break;
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    const unlistenPedalPromise = listenForPedalDetection();

    // Cleanup the listener when the component unmounts
    return () => {
      unlistenPromise.then(unlisten => unlisten());
      unlistenPedalPromise.then(unlisten => unlisten());
    };
  }, []); // Empty dependency array ensures this runs only once

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
      {/* Main Container */}
      <div className="max-h-full max-w-7xl my-0 mx-auto bg-white rounded-lg">
        {/* Header */}
        <div className="p-6 relative">
          <div className="mt-0 mb-2 border rounded-lg overflow-hidden">
            {(audioSrc && subtitles.length > 0) && (
              <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3 flex-shrink min-w-0">
                  {transcriptionFileName ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-gray-700 truncate" title={transcriptionFileName}>
                        <strong className="font-medium">{transcriptionFileName}</strong>
                      </p>
                      {viewMode === 'paragraph' && (
                        <button
                          className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                          onClick={() => setViewMode('table')}>
                          Switch to Table View
                          <FaTable className="mx-2 h-4 w-4" />
                        </button>
                      )}
                      {viewMode === 'table' && (
                        <button
                          className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors flex items-center flex-shrink-0"
                          onClick={() => setViewMode('paragraph')}>
                          Switch to Paragraph View
                          <FaParagraph className="mx-2 h-4 w-4" />
                        </button>
                      )}
                    </div>
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
                {viewMode === 'table' && (
                  <SubtitleTable
                    sortedSubtitles={sortedSubtitles}
                    currentTime={currentTime}
                    tableBodyRef={tableBodyRef}
                    setIsPlaying={setIsPlaying}
                    jumpToTime={jumpToTime}
                    updateSubtitleText={updateSubtitleText}
                    markSubtitleChecked={markSubtitleChecked}
                    copySegmentToClipboard={copySegmentToClipboard}
                  />
                )}
                {viewMode === 'paragraph' && (
                  <SubtitleParagraph
                    sortedSubtitles={sortedSubtitles}
                    currentTime={currentTime}
                    setIsPlaying={setIsPlaying}
                    jumpToTime={jumpToTime}
                    updateSubtitleText={updateSubtitleText}
                    markSubtitleChecked={markSubtitleChecked}
                    copySegmentToClipboard={copySegmentToClipboard}
                  />
                )}
              </div>
            ) : (
              <div className="text-center p-12 bg-gray-50 rounded-lg border-t border-gray-200">
                <div
                  className="border-2 border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer hover:bg-gray-50"
                >
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
          <div>{isPedalConnected ? <span>VEC3 Infinity Pedal Connected!</span> : <span>No pedal found</span>}</div>
        </div>
      </div>
    </div >
  );
};

export default App;
