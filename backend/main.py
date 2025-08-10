# api.py
# Description: An asynchronous FastAPI server to transcribe audio files using whisper-timestamped.

import whisper_timestamped as whisper
import uvicorn
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import uuid
from typing import Dict

# --- 1. Initialize FastAPI App ---
app = FastAPI(
    title="Whisper Timestamped API",
    description="An API to transcribe audio files asynchronously and get word-level timestamps.",
)

# Make sure this list includes the EXACT origin of your React app
# Check your browser's address bar for your React app.
origins = [
    "http://localhost:3000",  # For Create React App
    "http://localhost:5173",  # For Vite (very common)
    # Add any other port you might be using
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. In-Memory Job Store ---
# This dictionary will act as a simple, in-memory database to store the status
# and results of our transcription jobs. For a production system, you would
# replace this with a more robust solution like Redis or a database.
jobs: dict[str, Dict] = {}

# --- 3. Load the Whisper Model ---
# The model is loaded once when the application starts.
print("Loading Whisper model...")
model = whisper.load_model("tiny", device="cpu")  # Use "cuda" if you have a GPU
print("Model loaded successfully.")


# --- 4. Background Worker Function ---
def run_transcription(job_id: str, file_path: str):
    """
    This function runs in the background to perform the transcription.
    It updates the job store with the status and final result.
    """
    try:
        print(f"Job {job_id}: Starting transcription.")
        jobs[job_id]["status"] = "processing"

        # Perform the actual transcription
        result = whisper.transcribe(model, file_path, language="en")

        # Store the result and mark the job as complete
        jobs[job_id]["result"] = result
        jobs[job_id]["status"] = "complete"
        print(f"Job {job_id}: Transcription complete.")

    except Exception as e:
        print(f"Job {job_id}: An error occurred - {e}")
        jobs[job_id]["status"] = "error"
        jobs[job_id]["result"] = {"error": str(e)}

    finally:
        # Clean up the temporary file
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Job {job_id}: Temporary file {file_path} deleted.")


# --- 5. Define the Asynchronous Transcription Endpoint ---
@app.post("/transcribe/")
async def transcribe_audio_async(
    background_tasks: BackgroundTasks, audio_file: UploadFile = File(...)
):
    """
    Accepts an audio file, starts transcription in the background,
    and immediately returns a job ID.
    """
    # Generate a unique ID for this transcription job
    job_id = str(uuid.uuid4())

    # Save the uploaded file to a temporary location
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
            tmp.write(await audio_file.read())
            tmp_path = tmp.name
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"error": f"Failed to save uploaded file: {e}"}
        )

    # Initialize the job status in our job store
    jobs[job_id] = {"status": "queued", "result": None}

    # Add the long-running transcription task to the background
    background_tasks.add_task(run_transcription, job_id, tmp_path)

    # Immediately return a response to the client
    return JSONResponse(
        status_code=202,  # HTTP 202 Accepted
        content={
            "job_id": job_id,
            "status": "queued",
            "message": "Transcription has been queued. Check the status endpoint for results.",
        },
    )


# --- 6. Define the Status Endpoint ---
@app.get("/status/{job_id}")
async def get_transcription_status(job_id: str):
    """
    Checks the status of a transcription job and returns the result if complete.
    """
    job = jobs.get(job_id)

    if not job:
        return JSONResponse(status_code=404, content={"error": "Job ID not found."})

    if job["status"] == "complete":
        # If the job is done, return the result and remove it from the store
        result = job["result"]
        del jobs[job_id]
        return JSONResponse(
            status_code=200, content={"status": "complete", "result": result}
        )

    elif job["status"] == "error":
        # If an error occurred, return the error message
        error_details = job["result"]
        del jobs[job_id]
        return JSONResponse(
            status_code=500, content={"status": "error", "result": error_details}
        )

    # If the job is still queued or processing, just return the status
    return JSONResponse(
        status_code=200, content={"job_id": job_id, "status": job["status"]}
    )


# --- 7. Run the API Server ---
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
