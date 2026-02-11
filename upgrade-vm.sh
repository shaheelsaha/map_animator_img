#!/bin/bash

ZONE="us-central1-a"
INSTANCE="vertex-renderer"
MACHINE_TYPE="c2-standard-8"

echo "🛑 Stopping VM..."
gcloud compute instances stop $INSTANCE --zone=$ZONE --quiet

echo "⚙️  Updating machine type to $MACHINE_TYPE..."
gcloud compute instances set-machine-type $INSTANCE --zone=$ZONE --machine-type=$MACHINE_TYPE --quiet

echo "🟢 Starting VM..."
gcloud compute instances start $INSTANCE --zone=$ZONE --quiet

echo "✅ Upgrade complete!"
