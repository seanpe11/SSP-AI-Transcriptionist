# Dockerfile

# ---- Base Stage ----
FROM python:3.10-slim as base
WORKDIR /code

# Install ffmpeg using the apt package manager
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install \
    --default-timeout=100 \
    --retries 5 \
    --no-cache-dir \
    --upgrade -r requirements.txt


# Download and cache the Whisper model during the build
COPY download_model.py .
RUN python download_model.py

COPY . .

# ---- CPU Build Stage ----
FROM base as cpu
RUN pip install --no-cache-dir torch --extra-index-url https://download.pytorch.org/whl/cpu
CMD gunicorn --workers 1 --threads 8 --timeout 0 -k uvicorn.workers.UvicornWorker api:app --bind 0.0.0.0:${PORT:-8000}


# ---- GPU Build Stage ----
FROM base as gpu
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121
CMD gunicorn --workers 1 --threads 8 --timeout 0 -k uvicorn.workers.UvicornWorker api:app --bind 0.0.0.0:${PORT:-8000}
