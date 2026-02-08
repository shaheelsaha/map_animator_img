#!/bin/bash

INSTANCE_NAME="vertex-renderer"
ZONE="us-central1-a"

echo "📦 Packaging code..."
# Exclude node_modules, .git, and other unnecessary files
zip -r vertex-app.zip . -x "node_modules/*" ".git/*" "frames/*" "tmp/*"

echo "🚀 Uploading code to VM..."
gcloud compute scp vertex-app.zip $INSTANCE_NAME:~/vertex-app.zip --zone=$ZONE

echo "🔧 Unzipping and Installing on VM..."
gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="
    # Ensure directory exists and is writable
    sudo mkdir -p /app
    sudo chown \$USER /app
    
    # Unzip
    unzip -o ~/vertex-app.zip -d /app
    
    # Install dependencies
    cd /app
    npm install
    
    echo '✅ Code deployed to /app'
    echo '👉 To START SERVER: cd /app && node server.js'
"
