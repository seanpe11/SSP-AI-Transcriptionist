# api.py
import whisper_timestamped as whisper
import uvicorn
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv

# --- 1. Environment and Supabase Client Setup ---
print(f"👀 Current Working Directory: {os.getcwd()}")
load_dotenv()


def get_supabase_client() -> Client:
    """
    Initializes and returns the Supabase client, raising an error if config is missing.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("Supabase URL and Key must be set in the .env file.")

    print("✅ Supabase client initialized successfully.")
    return create_client(supabase_url, supabase_key)


# Initialize the client once when the module is imported
supabase = get_supabase_client()

# --- 2. FastAPI App Initialization ---
app = FastAPI(
    title="Whisper Timestamped API",
    description="An API to transcribe audio files asynchronously using Supabase for job tracking.",
)

# CORS Middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://transcriptions.seanpe.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. Global Variables & Model Loading ---
TABLE_NAME = "mdt_transcription_jobs"

print("Loading Whisper model...")
# Using "tiny" model for speed, can be changed to "base", "small", etc.
model = whisper.load_model("tiny", device="cpu")
print("✅ Whisper model loaded successfully.")


# --- 4. Background Worker Function ---
def run_transcription(job_id: str, file_path: str):
    """
    Background task to run transcription and update Supabase with the result.
    This function is identified by the internal job_id (UUID) for precise updates.
    """
    try:
        # Update status to 'processing' to indicate work has started
        print(f"Job {job_id}: Starting transcription, setting status to 'processing'.")
        supabase.table(TABLE_NAME).update({"status": "processing"}).eq(
            "id", job_id
        ).execute()

        # Perform the actual transcription
        result = whisper.transcribe(model, file_path, language="en")

        # Store the final result and mark the job as 'complete'
        _ = (
            supabase.table(TABLE_NAME)
            .update({"status": "complete", "result": result})
            .eq("id", job_id)
            .execute()
        )
        print(f"Job {job_id}: Transcription complete.")

    except Exception as e:
        print(f"Job {job_id}: An error occurred - {e}")
        error = (
            supabase.table(TABLE_NAME)
            .update({
                "status": "error",
                "result": {"error": str(e)},
            })
            .eq("id", job_id)
            .execute()
        )

    finally:
        # Clean up the temporary audio file to save space
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Job {job_id}: Temporary file {file_path} deleted.")


# --- 5. Transcription Endpoint ---
@app.post("/transcribe/")
async def transcribe_audio_async(
    background_tasks: BackgroundTasks, audio_file: UploadFile = File(...)
):
    """
    Accepts an audio file, checks for filename uniqueness, creates a job record,
    and starts the transcription in the background.
    """
    filename = audio_file.filename

    # Check if a job with this filename already exists to prevent duplicates
    response = (
        supabase.table(TABLE_NAME)
        .select("id")
        .eq("filename", filename)
        .maybe_single()
        .execute()
    )

    if response and response.data:
        return JSONResponse(
            status_code=409,  # 409 Conflict is more appropriate
            content={
                "error": f"A job with the filename '{filename}' already exists.",
                "job_id": response.data["id"],
            },
        )

    # Save the uploaded file to a temporary location for processing
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(filename)[1]
        ) as tmp:
            tmp.write(await audio_file.read())
            tmp_path = tmp.name
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"error": f"Failed to save file: {e}"}
        )

    # Generate a unique internal ID for this job
    job_id = str(uuid.uuid4())

    # Create a job record in Supabase with 'queued' status
    response = (
        supabase.table(TABLE_NAME)
        .insert({
            "id": job_id,
            "status": "queued",
            "filename": filename,  # Store the original filename
        })
        .execute()
    )

    # Add the long-running transcription task to the background
    background_tasks.add_task(run_transcription, job_id, tmp_path)

    # Immediately return a response to the client
    return JSONResponse(
        status_code=202,  # HTTP 202 Accepted
        content={
            "job_id": job_id,
            "filename": filename,
            "message": "Transcription has been queued. Check status using the filename.",
        },
    )


# --- 6. Status Endpoint ---
@app.get("/status/{filename}")
async def get_transcription_status(filename: str, job_id: str | None = None):
    """
    Queries Supabase using the filename to check the status of a transcription job.
    """
    response = (
        supabase.table(TABLE_NAME)
        .select("*")
        .eq("filename", filename)
        .maybe_single()
        .execute()
    )

    job = response.data
    if not job:
        return JSONResponse(status_code=404, content={"error": "Job not found."})

    return JSONResponse(status_code=200, content=job)


# --- 7. Run the API Server ---
if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
