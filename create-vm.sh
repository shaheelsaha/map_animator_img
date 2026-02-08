#!/bin/bash

# Configuration
INSTANCE_NAME="vertex-renderer"
REGION="us-central1"
ZONE="us-central1-a"
MACHINE_TYPE="e2-standard-4" # 4 vCPU, 16 GB RAM (Good balance)
IMAGE_PROJECT="ubuntu-os-cloud"
IMAGE_FAMILY="ubuntu-2204-lts"

echo "🚀 Creating VM instance '$INSTANCE_NAME'..."

gcloud compute instances create $INSTANCE_NAME \
    --project=map-animator-486522 \
    --zone=$ZONE \
    --machine-type=$MACHINE_TYPE \
    --image-family=$IMAGE_FAMILY \
    --image-project=$IMAGE_PROJECT \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-balanced \
    --tags=http-server,https-server \
    --metadata-from-file startup-script=startup-script.sh

echo "✅ VM Creation command sent."
echo "⏳ Wait a few minutes for the startup script to finish installing dependencies."
echo "👉 To SSH into the VM: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
