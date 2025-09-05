import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { ChangeEvent } from 'react';
import { SubtitleEntry, TranscribeApiResponse, StatusApiResponse, JsonTranscription } from '../types'; // Assuming types are moved to a types file
import { formatTime } from './useAudioPlayer'; // Re-exporting formatTime for use here

const API_BASE_URL = 'https://ssp-whisper-worker.sean-m-s-pe.workers.dev';

export const useTranscription = (audioFile: File | null) => {
    const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
    const [transcriptionFileName, setTranscriptionFileName] = useState<string | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const transcriptionInputRef = useRef<HTMLInputElement>(null);

    // API Call: Start transcription
    const startTranscriptionProcess = useCallback(async (file: File) => {
        setIsTranscribing(true);
        setSubtitles([]);
        setTranscriptionFileName(null);
        setToastMessage("Starting transcription...");

        const formData = new FormData();
        formData.append('audio_file', file);

        try {
            const response = await fetch(`${API_BASE_URL}/transcribe`, { method: 'POST', body: formData });
            const data: TranscribeApiResponse = await response.json();

            if (response.status === 202 && data.filename) {
                pollForStatus(data.filename);
            } else if (response.status === 409) {
                setToastMessage("Job already exists, fetching status...");
                pollForStatus(file.name);
            } else {
                throw new Error(data.error || 'Failed to start transcription');
            }
        } catch (error: any) {
            setToastMessage(`Error: ${error.message}`);
            setIsTranscribing(false);
        }
    }, []);

    // API Call: Poll for status
    const pollForStatus = useCallback(async (filename: string) => {
        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/status/${filename}`);
                if (!response.ok) {
                    if (response.status === 404) return; // Still processing
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data: StatusApiResponse = await response.json();

                if (data.status === 'complete' && data.result) {
                    clearInterval(intervalId);
                    setSubtitles(parseJsonTranscription(data.result));
                    setTranscriptionFileName(data.filename);
                    setIsTranscribing(false);
                    setToastMessage('Transcription complete!');
                } else if (data.status === 'error') {
                    clearInterval(intervalId);
                    setIsTranscribing(false);
                    setToastMessage(`Transcription failed: ${data.result?.text || 'Unknown error'}`);
                }
            } catch (error) {
                console.error("Polling error:", error);
                clearInterval(intervalId);
                setIsTranscribing(false);
                setToastMessage('An error occurred while checking transcription status.');
            }
        }, 3000);
    }, []);

    // Effect to start transcription when a new audio file is loaded
    useEffect(() => {
        if (audioFile) {
            startTranscriptionProcess(audioFile);
        }
    }, [audioFile, startTranscriptionProcess]);

    // Parse transcription from direct API response
    const parseJsonTranscription = (result: JsonTranscription): SubtitleEntry[] => {
        return result.segments.map(seg => ({
            id: seg.id,
            startTime: seg.start,
            endTime: seg.end,
            text: seg.text.trim(),
            confidence: seg.confidence,
        }));
    };

    // Parse transcription from a loaded file
    const parseJsonTranscriptionFromFile = (content: string): SubtitleEntry[] => {
        try {
            const result = JSON.parse(content);
            const data: JsonTranscription = result.result;
            if (!data.segments || !Array.isArray(data.segments)) throw new Error("Invalid JSON format");
            return parseJsonTranscription(data);
        } catch (error) {
            console.error("Failed to parse JSON file:", error);
            setToastMessage("Invalid JSON file. Please check format.");
            return [];
        }
    };

    // Load a transcription file manually
    const loadNewTranscription = (file: File | null | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setSubtitles(parseJsonTranscriptionFromFile(content));
            setTranscriptionFileName(file.name);
            setIsTranscribing(false);
        };
        reader.readAsText(file);
    };

    const onTranscriptionDrop = useCallback((acceptedFiles: File[]) => {
        loadNewTranscription(acceptedFiles[0]);
    }, []);

    const { getRootProps: getSubtitleRootProps, getInputProps: getSubtitleInputProps } = useDropzone({
        onDrop: onTranscriptionDrop,
        accept: { 'application/json': ['.json'] },
        multiple: false,
    });

    const triggerTranscriptionInputChange = () => transcriptionInputRef.current?.click();
    const handleTranscriptionChange = (e: ChangeEvent<HTMLInputElement>) => {
        loadNewTranscription(e.target.files?.[0]);
    };

    // Subtitle management functions
    const updateSubtitleText = (id: number, text: string) => {
        setSubtitles(subs => subs.map(sub => sub.id === id ? { ...sub, text, checked: true } : sub));
    };

    const markSubtitleChecked = (id: number, checked: boolean) => {
        setSubtitles(subs => subs.map(sub => sub.id === id ? { ...sub, checked } : sub));
    };

    const sortedSubtitles = useMemo(() => [...subtitles].sort((a, b) => a.startTime - b.startTime), [subtitles]);

    return {
        subtitles,
        setSubtitles,
        sortedSubtitles,
        transcriptionFileName,
        isTranscribing,
        toastMessage,
        setToastMessage,
        updateSubtitleText,
        markSubtitleChecked,
        getSubtitleRootProps,
        getSubtitleInputProps,
        triggerTranscriptionInputChange,
        handleTranscriptionChange,
        transcriptionInputRef,
    };
};
