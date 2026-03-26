#!/bin/bash

PORT=${PORT:-3001}

echo "Lloyd's Insurance Workflow"
echo "=========================="

# Check correct directory
if [ ! -f "package.json" ]; then
    echo "Error: run this from the project root directory."
    exit 1
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install || { echo "npm install failed"; exit 1; }
fi

# Kill anything on the port
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo "Killing existing process on port $PORT..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    sleep 1
fi

echo "Starting dev server on port $PORT..."
echo "URL:   http://localhost:$PORT"
echo "Login: admin@example.com / password123"
echo ""

PORT=$PORT npm run dev
