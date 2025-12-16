#!/bin/bash
# Local startup script for Gin Rummy
# This script starts the server and opens the app in your browser

echo "🃏 Starting Gin Rummy locally..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the app if dist folder doesn't exist or if it's outdated
if [ ! -d "dist" ] || [ "index.html" -nt "dist/index.html" ] 2>/dev/null; then
    echo "🔨 Building app..."
    npm run build
fi

# Get the port from environment or use default
PORT=${PORT:-3000}

# Start the server
echo "🚀 Starting server on port $PORT..."
echo "📱 Open http://localhost:$PORT in your browser"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
NODE_ENV=production npm start

