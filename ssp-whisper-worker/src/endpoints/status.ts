/*
================================================================================
File: src/endpoints/status.ts
Description: Fetches the status and result of a transcription job.
================================================================================
*/
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext, StatusResponse } from "../types";
import { createClient } from "@supabase/supabase-js";

export class Status extends OpenAPIRoute {
	schema = {
		tags: ["Transcription"],
		summary: "Get the status of a transcription job by filename.",
		request: {
			params: z.object({
				filename: Str({ description: "The filename of the audio file." }),
			}),
		},
		responses: {
			"200": {
				description: "Returns the current status and result of the job.",
				content: {
					"application/json": {
						schema: StatusResponse,
					},
				},
			},
			"404": {
				description: "Job not found.",
			},
		},
	};

	async handle(c: AppContext) {
		// Correctly destructure the filename from the 'params' object
		const { params: { filename } } = await this.getValidatedData<typeof this.schema>();
		const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY);

		console.log(filename);

		const { data: job, error } = await supabase
			.from("mdt_transcription_jobs")
			.select("*")
			.eq("filename", filename)
			.maybeSingle();

		if (error) {
			return c.json({ error: "Database query failed." }, 500);
		}

		if (!job) {
			return c.json({ error: "Job not found." }, 404);
		}

		return c.json(job, 200);
	}
}
