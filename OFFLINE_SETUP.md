# Running Gin Rummy Offline/Locally

This guide explains how to run Gin Rummy on your local machine without needing an internet connection (after initial setup).

## Quick Start

### Option 1: Using the Startup Scripts (Easiest)

**On Mac/Linux:**
```bash
./start-local.sh
```

**On Windows:**
Double-click `start-local.bat` or run it from Command Prompt:
```cmd
start-local.bat
```

The script will:
- Check if Node.js is installed
- Install dependencies if needed
- Start the server on `http://localhost:3000`
- Open the app in your browser automatically

### Option 2: Manual Start

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Version 22.x or higher recommended

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Server**
   ```bash
   npm run start:local
   ```
   Or:
   ```bash
   NODE_ENV=production node server/index.js
   ```

4. **Open in Browser**
   - Navigate to: `http://localhost:3000`
   - The app will work completely offline (after initial load)

## Features

### Progressive Web App (PWA)
- The app can be installed on your device
- Assets are cached for offline use
- Works like a native app

### Local Server
- All game logic runs on your machine
- No external dependencies required
- Perfect for LAN parties or offline play

## Installation as PWA

### Desktop (Chrome/Edge)
1. Open the app in your browser
2. Click the install icon in the address bar
3. Or go to Menu → Install App

### Mobile (iOS)
1. Open the app in Safari
2. Tap Share button
3. Select "Add to Home Screen"

### Mobile (Android)
1. Open the app in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen" or "Install App"

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, set a different port:
```bash
PORT=3001 npm run start:local
```

### Dependencies Not Installing
Make sure you have Node.js installed:
```bash
node --version
npm --version
```

### Service Worker Not Working
- Make sure you're accessing via `http://localhost:3000` (not `file://`)
- Check browser console for errors
- Try clearing browser cache

## Building for Production

To create a production build:
```bash
npm run build
```

The built files will be in the `dist/` folder. The server will automatically serve these files in production mode.

## Network Setup for Multiplayer

### Same Computer
- All players connect to `http://localhost:3000`
- Works perfectly for local testing

### Local Network (LAN)
1. Find your computer's IP address:
   - **Mac/Linux**: `ifconfig` or `ip addr`
   - **Windows**: `ipconfig`
   
2. Other players connect to: `http://YOUR_IP:3000`
   - Example: `http://192.168.1.100:3000`

3. Make sure firewall allows connections on port 3000

### Internet (Requires Port Forwarding)
1. Forward port 3000 on your router
2. Share your public IP address
3. Players connect to: `http://YOUR_PUBLIC_IP:3000`

⚠️ **Security Note**: Running a server accessible from the internet requires proper security measures. Only do this on trusted networks.

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## Notes

- The server must be running for the game to work (it handles game logic and Socket.IO connections)
- All game data is stored in memory (lost when server restarts)
- For persistent storage, you would need to add a database
- The app works offline after the initial page load (thanks to service workers)

