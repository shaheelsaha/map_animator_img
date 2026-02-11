#!/bin/bash

# Configuration
PROJECT_ID="map-animator-486522"
REGION="us-central1"
SERVICE_NAME="vertex-renderer"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run (Region: $REGION)..."

# Deploy command with GPU flags
# - gpu 1: Enable 1 GPU
# - gpu-type nvidia-l4: Use Nvidia L4 GPU
# - memory 16Gi: Required for L4 GPU
# - cpu 4: Required for L4 GPU
# - execution-environment gen2: Required for GPU
# - no-cpu-throttling: Ensure full performance during request processing
# - concurrency 1: One render per instance to avoid resource contention

gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --memory 16Gi \
  --cpu 4 \
  --execution-environment gen2 \
  --no-cpu-throttling \
  --timeout 3600 \
  --concurrency 1 \
  --max-instances 1

echo "✅ Deployment initiated."
