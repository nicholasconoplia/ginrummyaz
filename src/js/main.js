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

// Initialize application
async function init() {
    console.log('🃏 Initializing Gin Rummy...');

    // Initialize modules
    initLobby();
    initGame();

    // Set up reconnection event handlers BEFORE connecting
    setupReconnectionHandlers();

    // Check if we have a saved session BEFORE connecting
    const hasSession = socketClient.hasActiveSession();
    
    if (hasSession) {
        console.log('Found saved session, will attempt to reconnect...');
        showToast('Reconnecting to your game...', 'info');
    }

    // Connect to server
    try {
        await socketClient.connect();

        // If we had a session, wait a bit for the reconnection to complete
        // The socket.js connect handler will attempt reconnection automatically
        if (hasSession) {
            // Wait for reconnection attempt to complete (handled by socket.js)
            // The 'reconnected' event will show the correct screen
            // Set a timeout in case reconnection doesn't trigger the event
            setTimeout(() => {
                // If we're still not on a game/lobby screen, something went wrong
                const currentScreen = document.querySelector('.screen.active');
                if (!currentScreen || currentScreen.id === 'loading-screen') {
                    console.log('Reconnection timed out, showing home screen');
                    showScreen('home-screen');
                }
            }, 5000); // 5 second timeout
        } else {
            // No saved session, show home screen
            showScreen('home-screen');
        }

    } catch (error) {
        console.error('Failed to connect:', error);
        showToast('Failed to connect to server. Please refresh.', 'error');

        // Still show home screen, but connection will retry
        showScreen('home-screen');
    }

    console.log('🃏 Gin Rummy initialized!');
}

// Set up handlers for connection/reconnection events
function setupReconnectionHandlers() {
    // Handle successful reconnection to game
    socketClient.on('reconnected', (result) => {
        console.log('Reconnection successful:', result);
        showToast('Reconnected to game!', 'success');
        
        if (result.gameState) {
            // Game in progress, go to game screen
            showScreen('game-screen');
        } else if (result.lobby) {
            // In lobby, go to waiting room
            showScreen('waiting-room-screen');
        }
    });

    // Handle connection lost
    socketClient.on('connectionLost', (reason) => {
        console.log('Connection lost:', reason);
        // Don't show scary message for transport close (normal disconnect)
        if (reason !== 'transport close') {
            showToast('Connection lost. Attempting to reconnect...', 'warning');
        }
    });

    // Handle reconnection attempts
    socketClient.on('reconnecting', ({ attempt, maxAttempts }) => {
        showToast(`Reconnecting... (${attempt}/${maxAttempts})`, 'info');
    });

    // Handle reconnection failure
    socketClient.on('reconnectFailed', (data) => {
        const errorMsg = data?.error || 'Session expired';
        console.log('Reconnection failed:', errorMsg);
        showToast(`Could not reconnect: ${errorMsg}`, 'warning');
        showScreen('home-screen');
    });
}

// Start the app
init();
