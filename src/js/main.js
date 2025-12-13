// Main entry point
// Initializes the application and manages global state

import { socketClient } from './socket.js';
import { initLobby, showScreen } from './lobby.js';
import { initGame } from './game.js';

// Toast notification system
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Check for existing session and attempt reconnect
async function checkExistingSession() {
    const session = socketClient.loadSession();
    if (session) {
        try {
            // Show loading while reconnecting
            showScreen('loading-screen');

            const response = await socketClient.reconnectToGame();

            if (response.gameState) {
                // Game in progress, go to game screen
                showScreen('game-screen');
                // The game:started event will trigger and render the game
                return true;
            } else if (response.lobby) {
                // In lobby, go to waiting room
                showScreen('waiting-room-screen');
                return true;
            }
        } catch (error) {
            console.log('Could not reconnect to previous session');
            socketClient.clearSession();
        }
    }
    return false;
}

// Initialize application
async function init() {
    console.log('🃏 Initializing Gin Rummy...');

    // Initialize modules
    initLobby();
    initGame();

    // Connect to server
    try {
        await socketClient.connect();

        // Check for existing session
        const reconnected = await checkExistingSession();

        if (!reconnected) {
            // Show home screen
            showScreen('home-screen');
        }

    } catch (error) {
        console.error('Failed to connect:', error);
        showToast('Failed to connect to server. Please refresh.', 'error');

        // Still show home screen, but connection will retry
        showScreen('home-screen');
    }

    // Handle connection lost
    socketClient.on('connectionLost', () => {
        showToast('Connection lost. Reconnecting...', 'warning');
    });

    console.log('🃏 Gin Rummy initialized!');
}

// Start the app
init();
