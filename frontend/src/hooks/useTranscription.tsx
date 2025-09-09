import { useState } from 'react';
import { SubtitleEntry, JsonTranscription, StatusApiResponse, TranscribeApiResponse } from '../types';

const API_BASE_URL = 'https://ssp-whisper-worker.sean-m-s-pe.workers.dev';

interface UseTranscriptionProps {
  setToastMessage: (message: string | null) => void;
}

export const useTranscription = ({ setToastMessage }: UseTranscriptionProps) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [transcriptionFileName, setTranscriptionFileName] = useState<string | null>(null);

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
          const parsed = parseJsonTranscription(data.result);
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

  const loadTranscriptionFileContent = (content: string, fileName: string) => {
    try {
      const result = JSON.parse(content);
      const data: JsonTranscription = result.result;

      if (!data.segments || !Array.isArray(data.segments)) {
        console.error("Invalid JSON format: 'segments' array not found.");
        setToastMessage("Invalid JSON file. Please check the file format and try again.");
        return;
      }

      const parsedSubtitles = data.segments.map(seg => ({
        id: seg.id,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text.trim(),
        confidence: seg.confidence,
      }));

      setSubtitles(parsedSubtitles);
      setTranscriptionFileName(fileName);

    } catch (error) {
      console.error("Failed to parse JSON file:", error);
      setToastMessage("Invalid JSON file. Please check the file format and try again.");
    }
  };

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

  return {
    isTranscribing, setIsTranscribing,
    subtitles,
    setSubtitles,
    transcriptionFileName, setTranscriptionFileName,
    startTranscriptionProcess,
    loadTranscriptionFileContent,
    updateSubtitleText,
    markSubtitleChecked,
  };
};


/// *** For Dropping JSON Transcription File ***
// // Handle transcription file drop
// const onTranscriptionDrop = useCallback((acceptedFiles: File[]) => {
//   const file = acceptedFiles[0];
//   if (!file) return;
//   loadNewTranscription(file);
// }, []);

// Load and process the new transcription file
// const loadNewTranscription = (file: File | null | undefined) => {
//   if (!file) return;
//
//   const reader = new FileReader();
//   reader.onload = (e) => {
//     const content = e.target?.result as string;
//     const parsed = parseJsonTranscriptionFromFile(content);
//     setTranscriptionFileName(file.name);
//     setSubtitles(parsed);
//   };
//   reader.readAsText(file);
// };
//
