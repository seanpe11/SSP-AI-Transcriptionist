import { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ChangeEvent } from 'react';

export const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(3, '0')}`;
};

export const useAudioPlayer = () => {
    const [audioSrc, setAudioSrc] = useState<string | null>(null);
    const [audioFileName, setAudioFileName] = useState<string | null>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const audioRef = useRef<HTMLAudioElement>(null);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Main function to load a new audio file
    const loadNewAudio = useCallback((file: File | null | undefined) => {
        if (!file) return;

        if (audioSrc) {
            URL.revokeObjectURL(audioSrc);
        }

        const url = URL.createObjectURL(file);
        if (audioRef.current) audioRef.current.currentTime = 0;

        setAudioFile(file);
        setAudioFileName(file.name);
        setAudioSrc(url);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
    }, [audioSrc]);

    // Dropzone setup
    const onAudioDrop = useCallback((acceptedFiles: File[]) => {
        loadNewAudio(acceptedFiles[0]);
    }, [loadNewAudio]);

    const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps } = useDropzone({
        onDrop: onAudioDrop,
        accept: { 'audio/*': [] },
        multiple: false,
    });

    // File input change handlers
    const triggerAudioInputChange = () => audioInputRef.current?.click();
    const handleAudioChange = (e: ChangeEvent<HTMLInputElement>) => {
        loadNewAudio(e.target.files?.[0]);
        if (e.target) e.target.value = '';
    };

    // Draw waveform on audio source change
    useEffect(() => {
        if (!audioSrc || !waveformRef.current) return;

        const canvas = waveformRef.current;
        const audio = new Audio(audioSrc);
        const context = new AudioContext();

        audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));

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

    }, [audioSrc]);

    // Animation loop for current time
    const updateTimeDisplay = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            animationRef.current = requestAnimationFrame(updateTimeDisplay);
        }
    }, []);

    // Effect to handle play/pause and cleanup animation frame
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
            }
        };
    }, [isPlaying, updateTimeDisplay]);

    // Exposed playback controls
    const jumpToTime = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!waveformRef.current || duration === 0) return;
        const rect = waveformRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickTimeRatio = x / rect.width;
        const newTime = clickTimeRatio * duration;
        jumpToTime(newTime);
    };

    return {
        audioRef,
        waveformRef,
        audioInputRef,
        audioSrc,
        audioFileName,
        audioFile,
        isPlaying,
        setIsPlaying,
        currentTime,
        duration,
        jumpToTime,
        handleWaveformClick,
        getAudioRootProps,
        getAudioInputProps,
        triggerAudioInputChange,
        handleAudioChange,
        loadNewAudio,
    };
};
