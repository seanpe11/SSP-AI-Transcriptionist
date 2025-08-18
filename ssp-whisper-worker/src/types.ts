import { DateTime, Str } from "chanfana";
import type { Context } from "hono";
import { z } from "zod";

export type AppContext = Context<{ Bindings: Env }>;

// This schema is not used for a JSON body, as the /transcribe
// endpoint expects multipart/form-data. It's kept for consistency.
export const TranscribeRequest = z.object({});

// Schema for the successful (202 Accepted) response from the /transcribe endpoint
export const TranscribeResponse = z.object({
	job_id: z.string().uuid({ message: "Invalid Job ID format" }),
	filename: z.string(),
	message: z.string(),
});

// --- Schemas for the Status Endpoint ---

// Defines a single segment within a transcription
const Segment = z.object({
	id: z.number(),
	start: z.number(),
	end: z.number(),
	text: z.string(),
	// Including other optional fields from the whisper_timestamped output
	seek: z.number().optional(),
	tokens: z.array(z.number()).optional(),
	temperature: z.number().optional(),
	avg_logprob: z.number().optional(),
	compression_ratio: z.number().optional(),
	no_speech_prob: z.number().optional(),
	confidence: z.number().optional(), // For older data
});

// Defines the structure of a successful transcription result
const TranscriptionResult = z.object({
	text: z.string(),
	segments: z.array(Segment),
	language: z.string().optional(),
});

// Defines the structure of an error object within the result
const ErrorResult = z.object({
	error: z.string(),
});

// Schema for the response from the /status/{filename} endpoint
export const StatusResponse = z.object({
	id: z.string().uuid(),
	status: z.enum(["queued", "processing", "complete", "error"]),
	filename: z.string(),
	// The result can be a full transcription, an error, or null
	result: z.union([TranscriptionResult, ErrorResult]).nullable(),
});

export const DotEnv = z.object({
	SUPABASE_URL: z.string(),
	SUPABASE_KEY: z.string(),
	OPENAI_API_KEY: z.string(),
});
