/*
================================================================================
File: src/index.ts
Description: Main router for the Hono application.
================================================================================
*/
import { fromHono } from "chanfana";
import { Hono } from "hono";
import { Transcribe } from "./endpoints/transcribe";
import { Status } from "./endpoints/status";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/docs",
});

// Register OpenAPI endpoints for transcription API
openapi.post("/transcribe", Transcribe);
openapi.get("/status/:filename", Status);

// Export the Hono app
export default app;
