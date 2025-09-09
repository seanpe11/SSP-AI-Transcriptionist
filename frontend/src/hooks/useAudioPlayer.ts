import { useState, useRef, useCallback, useEffect, Dispatch, SetStateAction } from 'react';
import { SubtitleEntry } from '../types';

interface UseAudioPlayerProps {
  setCurrentEditIndex: Dispatch<SetStateAction<number | null>>;
  sortedSubtitles: SubtitleEntry[];
}

export const useAudioPlayer = ({ setCurrentEditIndex, sortedSubtitles }: UseAudioPlayerProps) => {
  // audio player state
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [_audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [_waveform, setWaveform] = useState<HTMLCanvasElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

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

        // The type for prevIndex now correctly includes 'null'
        setCurrentEditIndex((prevIndex: number | null) => {
          // Only update the state if the index has actually changed
          if (prevIndex !== subtitleIndex) {
            console.log("Setting new index:", subtitleIndex);
            return subtitleIndex;
          }
          // Otherwise, return the existing state to prevent a re-render
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

  // Set current time from waveform click
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!waveformRef.current || duration === 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTimeRatio = x / rect.width;
    const newTime = clickTimeRatio * duration;
    jumpToTime(newTime);
  };



  return {
    audioSrc, setAudioSrc,
    audioFileName, setAudioFileName,
    _audioFile, setAudioFile,
    isPlaying, setIsPlaying,
    autoScroll, setAutoScroll,
    duration, setDuration,
    _waveform, setWaveform,
    currentTime, setCurrentTime,
    jumpToTime,
    handleWaveformClick,
    waveformRef,
    audioRef,
    animationRef
  };
};
