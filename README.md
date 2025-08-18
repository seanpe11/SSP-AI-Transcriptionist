# TODO

- [ ] Change db to use filename as composite PK

# Deployment

gcloud login, make sure you have image name set

`set -gx IMAGE_NAME "us-central1-docker.pkg.dev/$(gcloud config get-value project)/transcription-backend-repo/transcription-api:gpu"`

gcloud run deploy transcription-api-gpu \
        --image=$IMAGE_NAME \
        --platform=managed \
        --region=us-central1 \
        --execution-environment=gen2 \
        --allow-unauthenticated \
        --cpu=4 \
        --memory=16Gi \
        --gpu-type=nvidia-l4 \
        --startup-probe "tcpSocket.port=8080,initialDelaySeconds=90,timeoutSeconds=10,failureThreshold=3" \
        --set-env-vars=

startup probe condition is important for GPU setup, whisper takes a while to load
