@echo off
REM Local startup script for Gin Rummy (Windows)
REM This script starts the server and opens the app in your browser

echo 🃏 Starting Gin Rummy locally...

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
)

REM Build the app if dist folder doesn't exist
if not exist "dist" (
    echo 🔨 Building app...
    call npm run build
)

REM Get the port from environment or use default
if "%PORT%"=="" set PORT=3000

REM Start the server
echo 🚀 Starting server on port %PORT%...
echo 📱 Open http://localhost:%PORT% in your browser
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
set NODE_ENV=production
call npm start

pause

