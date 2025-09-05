export type SubtitleEntry = {
    id: number;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number; // Added confidence field
    checked?: boolean;
};

export interface JsonSegment {
    id: number;
    start: number;
    end: number;
    text: string;
    confidence?: number;
}

export interface TranscribeApiResponse {
    filename?: string;
    error?: string;
    job_id?: string;
    message?: string;
}

export interface StatusApiResponse {
    id: string;
    status: "processing" | "complete" | "error";
    result: JsonTranscription | null;
    filename: string;
}

// This interface represents the overall structure of the JSON file.
export interface JsonTranscription {
    text: string;
    segments: JsonSegment[];
    language?: string;
}

