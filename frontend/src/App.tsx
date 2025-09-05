import React, { useState, useRef, useEffect } from 'react';
import { FaFileAudio, FaPlay, FaPause, FaClipboard, FaRegFileAudio, FaInfoCircle } from 'react-icons/fa';

// Import hooks
import { useAudioPlayer, formatTime } from './hooks/useAudioPlayer';
import { useTranscription } from './hooks/useTranscription';
import { useTauriEvents } from './hooks/useTauriEvents';

// Import types (assuming they are in a separate file)
import { SubtitleEntry } from './types';

// UI Components
const Spinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-4">
    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    <p className="text-gray-600 font-medium">Transcription in progress...</p>
  </div>
);

const Toast: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed bottom-5 right-5 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
    {message}
  </div>
);

const App: React.FC = () => {
  // === HOOKS INITIALIZATION ===
  const {
    audioRef, waveformRef, audioInputRef, audioSrc, audioFileName, audioFile, isPlaying,
    setIsPlaying, currentTime, duration, jumpToTime, handleWaveformClick, getAudioRootProps,
    getAudioInputProps, triggerAudioInputChange, handleAudioChange,
  } = useAudioPlayer();

  const {
    subtitles, sortedSubtitles, transcriptionFileName, isTranscribing, toastMessage, setToastMessage,
    updateSubtitleText, markSubtitleChecked, getSubtitleRootProps, getSubtitleInputProps,
  } = useTranscription(audioFile);

  // === UI STATE & REFS ===
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const currentEditIndexRef = useRef<number | null>(null); // Ref for Tauri callbacks
  useEffect(() => { currentEditIndexRef.current = currentEditIndex }, [currentEditIndex]);

  // === "GLUE" LOGIC ===

  // Effect to hide toast message after a delay
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, setToastMessage]);

  // Effect to link audio currentTime to the active subtitle row
  useEffect(() => {
    const activeIndex = sortedSubtitles.findIndex(
      sub => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
    setCurrentEditIndex(activeIndex !== -1 ? activeIndex : null);
  }, [currentTime, sortedSubtitles]);

  // Auto-scroll to the active subtitle
  useEffect(() => {
    if (autoScroll && currentEditIndex !== null && tableBodyRef.current) {
      const activeRow = tableBodyRef.current.children[currentEditIndex] as HTMLTableRowElement;
      if (activeRow) {
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentEditIndex, autoScroll]);

  // Pedal control handlers
  const handlePedalPrev = () => {
    const currentIndex = currentEditIndexRef.current;
    if (currentIndex !== null && audioRef.current) {
      // If near start of a segment, jump to previous one
      if (audioRef.current.currentTime <= sortedSubtitles[currentIndex].startTime + 0.2 && currentIndex > 0) {
        jumpToTime(sortedSubtitles[currentIndex - 1].startTime);
      } else {
        jumpToTime(sortedSubtitles[currentIndex].startTime);
      }
    } else {
      jumpToTime(0);
    }
  };

  const handlePedalNext = () => {
    const currentIndex = currentEditIndexRef.current;
    if (currentIndex !== null && currentIndex < sortedSubtitles.length - 1) {
      jumpToTime(sortedSubtitles[currentIndex + 1].startTime);
    }
  };

  const { isPedalConnected } = useTauriEvents({
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onNext: handlePedalNext,
    onPrev: handlePedalPrev,
  });

  // === UTILITY / HELPER FUNCTIONS FOR UI ===
  const copyRaw = (subs: SubtitleEntry[]) => subs.map(sub => sub.text.trim()).join(' ');

  const copySRTToClipboard = () => {
    const content = copyRaw(subtitles);
    navigator.clipboard.writeText(content).then(() => setToastMessage('Full transcription copied!'));
  };

  const copySegmentToClipboard = (subtitle: SubtitleEntry) => {
    const content = copyRaw([subtitle]);
    navigator.clipboard.writeText(content).then(() => setToastMessage('Segment copied!'));
  };

  const colorForConfidence = (confidence: number | undefined) => {
    if (confidence === undefined) return 'text-gray-500';
    if (confidence < 0.5) return 'text-red-500';
    if (confidence < 0.75) return 'text-yellow-500';
    return 'text-green-500';
  };


  return (
    <div className="max-h-screen min-h-screen bg-gray-100">
      {toastMessage && <Toast message={toastMessage} />}
      <div className="max-h-full max-w-7xl my-0 mx-auto bg-white rounded-lg">
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
                        key={subtitle.startTime}
                        className={`${currentTime >= subtitle.startTime && currentTime < subtitle.endTime ? 'bg-blue-50' : ''}`}
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
          <div>{isPedalConnected ? <span>VEC3 Infinity Pedal Connected!</span> : <span>No pedal found</span>}</div>
        </div>
      </div>
    </div >
  );
};

export default App;
