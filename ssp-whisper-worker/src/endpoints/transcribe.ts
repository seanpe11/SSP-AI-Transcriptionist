/*
================================================================================
File: src/endpoints/transcribe.ts
Description: Handles the initial audio upload and starts the transcription job.
================================================================================ */
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, TranscribeResponse } from "../types";
import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

// Schema for the 409 Conflict response
const ConflictResponse = z.object({
	error: z.string(),
	job_id: z.string().uuid(),
});

export class Transcribe extends OpenAPIRoute {
	schema = {
		tags: ["Transcription"],
		summary: "Accepts an audio file and begins an asynchronous transcription job.",
		request: {
			body: {
				content: {
					"multipart/form-data": {
						schema: z.object({
							audio_file: z.instanceof(File),
						}),
					},
				},
			},
		},
		responses: {
			"202": {
				description: "Transcription job accepted and queued.",
				content: {
					"application/json": {
						schema: TranscribeResponse,
					},
				},
			},
			"409": {
				description: "A job with this filename already exists.",
				content: {
					"application/json": {
						schema: ConflictResponse,
					},
				},
			},
			"400": {
				description: "Bad Request: No file uploaded.",
			},
		},
	};

	async handle(c: AppContext) {
		const formData = await c.req.formData();
		const audioFile = formData.get("audio_file");

		if (!(audioFile instanceof File)) {
			return c.json({ error: "No audio file uploaded." }, 400);
		}

		const filename = audioFile.name;
		const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY);

		// 1. Check if a job with this filename already exists
		const { data: existingJob, error: selectError } = await supabase
			.from("mdt_transcription_jobs")
			.select("id")
			.eq("filename", filename)
			.maybeSingle();

		if (selectError) {
			return c.json({ error: "Database error checking for job." }, 500);
		}

		if (existingJob) {
			return c.json(
				{
					error: `A job with the filename '${filename}' already exists.`,
					job_id: existingJob.id,
				},
				409,
			);
		}

		// 2. Create a new job record in Supabase
		const job_id = crypto.randomUUID();
		const { error: insertError } = await supabase
			.from("mdt_transcription_jobs")
			.insert({
				id: job_id,
				status: "queued",
				filename: filename,
			});

		if (insertError) {
			return c.json({ error: "Failed to create transcription job." }, 500);
		}

		// 3. Start the background transcription task
		c.executionCtx.waitUntil(
			this.runTranscriptionInBackground(c.env, job_id, audioFile),
		);

		// 4. Respond immediately to the client
		return c.json(
			{
				job_id: job_id,
				filename: filename,
				message: "Transcription has been queued. Check status using the filename.",
			},
			202,
		);
	}

	async runTranscriptionInBackground(
		// @ts-ignore
		env: DotEnv,
		jobId: string,
		audioFile: File,
	) {
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
		const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

		try {
			// Update status to 'processing'
			await supabase
				.from("mdt_transcription_jobs")
				.update({ status: "processing" })
				.eq("id", jobId);

			// Call OpenAI Whisper API
			const transcription = await openai.audio.transcriptions.create({
				file: audioFile,
				model: "whisper-1",
				response_format: "verbose_json", // To get segments and timestamps
			});

			const transformed = {
				text: transcription.text,
				segments: transcription.segments.map(segment => ({
					text: segment.text,
					start: segment.start,
					end: segment.end,
					confidence: Math.exp(segment.avg_logprob),
				})),
			}

			// Update job with the final result
			await supabase
				.from("mdt_transcription_jobs")
				.update({ status: "complete", result: transformed })
				.eq("id", jobId);
		} catch (error) {
			console.error(`Transcription failed for job ${jobId}:`, error);
			// Update job with error status
			await supabase
				.from("mdt_transcription_jobs")
				.update({
					status: "error",
					// @ts-ignore
					result: { error: error.message || "An unknown error occurred" },
				})
				.eq("id", jobId);
		}
	}
}
