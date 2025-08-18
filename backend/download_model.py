# Downlaod whisper model for faster gcloud deployment
import whisper_timestamped as whisper
import torch

# This script's only purpose is to download and cache the model during the build.
print("Downloading and caching whisper-medium model...")
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper.load_model("medium", device=device)
print("Model download complete.")
