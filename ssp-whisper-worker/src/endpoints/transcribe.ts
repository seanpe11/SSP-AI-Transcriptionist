import { Bool, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types";
import { TranscribeResponse409, TranscribeResponse202, TranscribeRequest } from "../types";

export class Transcribe extends OpenAPIRoute {
	schema = {
		tags: ["Transcribe"],
		summary: "Begins a transcription job using Whisper, and annotates the Supabase table with the transcription",
		request: {
			body: {
				content: {
					"application/json": {
						schema: Task,
					},
				},
			},
		},
		responses: {
			"202": {
				description: "Returns the created task",
				content: {
					"application/json": {
						schema: z.object({
							series: z.object({
								success: Bool(),
								result: z.object({
									task: Task,
								}),
							}),
						}),
					},
				},
				"409": {
					description: "Filename already exists in the database",
					content: {
						"application/json": {
							schema: TranscribeResponse409,
						},
					}
				}
			},
		},
	};

	async handle(c: AppContext) {
		// Get validated data
		const data = await this.getValidatedData<typeof this.schema>();

		// Retrieve the validated request body
		const taskToCreate = data.body;

		// Implement your own object insertion here

		// return the new task
		return {
			success: true,
			task: {
				name: taskToCreate.name,
				slug: taskToCreate.slug,
				description: taskToCreate.description,
				completed: taskToCreate.completed,
				due_date: taskToCreate.due_date,
			},
		};
	}
}
