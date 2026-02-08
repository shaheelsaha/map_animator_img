#!/bin/bash

# Configuration
INSTANCE_NAME="vertex-renderer"
ZONE="us-central1-a"
APP_FILE="newApp.js" # This assumes running from repo root

CMD=$1

if [ "$CMD" == "start" ]; then
    echo "🟢 Starting VM '$INSTANCE_NAME'..."
    gcloud compute instances start $INSTANCE_NAME --zone=$ZONE
    
    echo "⏳ Getting new IP address..."
    sleep 5 # Wait for IP allocation
    NEW_IP=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
    
    echo "✅ VM is RUNNING at IP: $NEW_IP"
    
    # Update newApp.js with new IP using sed (macOS compatible)
    if [ -f "$APP_FILE" ]; then
        echo "🔄 Updating $APP_FILE with new IP..."
        # Use sed to replace the fetch URL
        sed -i '' "s|http://[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}:8080/render|http://$NEW_IP:8080/render|g" "$APP_FILE"
        echo "✅ Updated fetch URL in $APP_FILE"
        
        echo "🔨 Rebuilding frontend..."
        npm run build > /dev/null 2>&1
        echo "✅ Frontend rebuilt."
    else
        echo "⚠️ $APP_FILE not found! Please update IP manually."
    fi

    echo "👉 To START SERVER (Background): ./vm-control.sh start-server"
    echo "👉 To VIEW LOGS: ./vm-control.sh logs"
    echo "👉 To SSH manually: gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"

elif [ "$CMD" == "stop" ]; then
    echo "🔴 Stopping VM '$INSTANCE_NAME'..."
    gcloud compute instances stop $INSTANCE_NAME --zone=$ZONE
    echo "✅ VM Stopped. Billing paused."

elif [ "$CMD" == "start-server" ]; then
    echo "🚀 Starting Node server on VM..."
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="cd /app && nohup node server.js > server.log 2>&1 &"
    echo "✅ Server started in background."
    echo "👉 Run './vm-control.sh logs' to see output."

elif [ "$CMD" == "stop-server" ]; then
    echo "🛑 Stopping Node server on VM..."
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="pkill -f 'node server.js'"
    echo "✅ Server stopped."

elif [ "$CMD" == "restart-server" ]; then
    $0 stop-server
    sleep 2
    $0 start-server

elif [ "$CMD" == "logs" ]; then
    echo "📜 Streaming logs from VM..."
    gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command="tail -f /app/server.log"

else
    echo "Usage: ./vm-control.sh [start|stop|start-server|stop-server|restart-server|logs]"
fi
