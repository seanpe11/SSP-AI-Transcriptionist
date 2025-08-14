# Dockerfile

# ---- Base Stage ----
FROM python:3.10-slim as base
WORKDIR /code
COPY requirements.txt .

# Install ffmpeg using the apt package manager
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*



RUN pip install --no-cache-dir --upgrade -r requirements.txt
COPY . .

# ---- CPU Build Stage ----
# This is the default build. It installs the CPU-only version of PyTorch.
FROM base as cpu
RUN pip install --no-cache-dir torch --extra-index-url https://download.pytorch.org/whl/cpu
# Set the default command for the container
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "0", "-k", "uvicorn.workers.UvicornWorker", "api:app", "--bind", "0.0.0.0:8000"]


# ---- GPU Build Stage ----
# This stage installs the NVIDIA CUDA-enabled version of PyTorch.
FROM base as gpu
# This command installs PyTorch compatible with CUDA 12.1
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121
# Set the default command for the container
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "0", "-k", "uvicorn.workers.UvicornWorker", "api:app", "--bind", "0.0.0.0:8000"]
