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

    // Connect to server
    try {
        await socketClient.connect();

        // The socket client will automatically attempt to reconnect
        // if there's a saved session (handled in socket.js connect event)
        
        // If no active session, show home screen
        if (!socketClient.hasActiveSession()) {
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
    socketClient.on('reconnectFailed', () => {
        showToast('Could not reconnect. Please refresh the page.', 'error');
        socketClient.clearSession();
        showScreen('home-screen');
    });
}

// Start the app
init();
