#!/bin/bash

# Port number
PORT=8000

# Directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR"

# Clean up background processes on exit
cleanup() {
    echo ""
    echo "Stopping server and tunnel..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
    fi
    if [ ! -z "$TUNNEL_PID" ]; then
        kill $TUNNEL_PID 2>/dev/null
    fi
    exit
}
trap cleanup SIGINT SIGTERM EXIT

# Start server
echo "Starting Python web server..."
python3 server.py &
SERVER_PID=$!

# Wait a moment for server to start
sleep 1.5

if [ "$1" == "--share" ]; then
    echo "=================================================="
    echo "🔗 Establishing secure tunnel via SSH (localhost.run)..."
    echo "=================================================="
    
    # Start SSH tunnel
    # StrictHostKeyChecking=no prevents host key verification prompt
    # UserKnownHostsFile=/dev/null keeps known_hosts clean
    ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -R 80:localhost:$PORT nokey@localhost.run &
    TUNNEL_PID=$!
    
    echo "Waiting for tunnel connection..."
    sleep 3
    echo ""
    echo "=================================================="
    echo "🎉 PairMap is running!"
    echo "=================================================="
    echo "ローカル接続: http://localhost:$PORT"
    echo "外部共有接続: 上記に表示されている 'https://xxx.localhost.run' をコピーして相手に送ってください。"
    echo "=================================================="
fi

# Wait for server process to finish
wait $SERVER_PID
