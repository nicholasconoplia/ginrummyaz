// Socket.IO client wrapper
// Handles connection, events, and reconnection logic

import { io } from 'socket.io-client';

class SocketClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.playerId = null;  // Persistent player ID (survives page refresh)
        this.lobbyCode = null;
        this.playerName = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.eventHandlers = new Map();
        this.isReconnecting = false;
        
        // Load any saved session on construction
        this.loadSession();
    }

    // Connect to the server
    connect() {
        return new Promise((resolve, reject) => {
            // In development, connect to the separate server
            // In production, connect to the same origin
            // If you deploy the frontend and backend to different hosts (e.g. Vercel + Render),
            // set VITE_SERVER_URL in the frontend environment to your backend base URL.
            // Example: https://your-backend.onrender.com
            const serverUrl = import.meta.env.DEV
                ? 'http://localhost:3000'
                : (import.meta.env.VITE_SERVER_URL || window.location.origin);

            this.socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            });

            this.socket.on('connect', () => {
                console.log('Connected to server:', this.socket.id);
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // If we had a previous session, try to reconnect automatically
                if (this.lobbyCode && this.playerId && !this.isReconnecting) {
                    console.log('Attempting to reconnect to previous session:', this.lobbyCode);
                    this.isReconnecting = true;
                    this.reconnectToGame()
                        .then((result) => {
                            console.log('Reconnected to game successfully!', result);
                            this.isReconnecting = false;
                            this.emit('reconnected', result);
                        })
                        .catch((error) => {
                            console.log('Could not reconnect to previous session:', error.message);
                            this.isReconnecting = false;
                            // Clear the invalid session
                            this.clearSession();
                        });
                }

                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.isConnected = false;
                // Don't reject on reconnection attempts, only on initial connect
                if (this.reconnectAttempts === 0) {
                    reject(error);
                }
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected:', reason);
                this.isConnected = false;
                
                // Don't clear session on disconnect - we want to reconnect!
                // Only emit the event so UI can show "reconnecting..."
                this.emit('connectionLost', reason);
            });

            // Socket.IO built-in reconnection events
            this.socket.on('reconnect_attempt', (attempt) => {
                console.log(`Reconnection attempt ${attempt}...`);
                this.reconnectAttempts = attempt;
                this.emit('reconnecting', { attempt, maxAttempts: this.maxReconnectAttempts });
            });

            this.socket.on('reconnect', () => {
                console.log('Socket reconnected!');
                // The 'connect' event will handle the game reconnection
            });

            this.socket.on('reconnect_failed', () => {
                console.log('Reconnection failed after max attempts');
                this.emit('reconnectFailed');
            });

            // Set up event forwarding
            this.setupEventForwarding();
        });
    }

    // Set up event forwarding to registered handlers
    setupEventForwarding() {
        const events = [
            'lobby:playerJoined',
            'lobby:playerLeft',
            'lobby:settingsUpdated',
            'lobby:reset',
            'lobby:firstPlayerUpdated',
            'game:started',
            'game:state',
            'game:action',
            'game:over'
        ];

        events.forEach(event => {
            this.socket.on(event, (data) => {
                this.emit(event, data);
            });
        });
    }

    // Register event handler
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    // Remove event handler
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    // Emit to local handlers
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => handler(data));
        }
    }

    // Create a new lobby
    createLobby(playerName, settings = {}) {
        return new Promise((resolve, reject) => {
            this.socket.emit('lobby:create', { playerName, settings }, (response) => {
                if (response.success) {
                    this.playerId = response.playerId;
                    this.lobbyCode = response.code;
                    this.playerName = playerName;
                    this.saveSession();
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Join an existing lobby
    joinLobby(lobbyCode, playerName) {
        return new Promise((resolve, reject) => {
            this.socket.emit('lobby:join', { lobbyCode, playerName }, (response) => {
                if (response.success) {
                    this.playerId = response.playerId;
                    this.lobbyCode = lobbyCode.toUpperCase();
                    this.playerName = playerName;
                    this.saveSession();
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Leave current lobby
    leaveLobby() {
        return new Promise((resolve) => {
            this.socket.emit('lobby:leave', (response) => {
                this.playerId = null;
                this.lobbyCode = null;
                this.clearSession();
                resolve(response);
            });
        });
    }

    // Update lobby settings
    updateSettings(settings) {
        return new Promise((resolve, reject) => {
            this.socket.emit('lobby:updateSettings', { settings }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Start the game
    startGame() {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:start', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Add a test player for development
    addTestPlayer() {
        return new Promise((resolve, reject) => {
            this.socket.emit('lobby:addTestPlayer', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Shuffle to determine first player
    shuffleFirstPlayer() {
        return new Promise((resolve, reject) => {
            this.socket.emit('lobby:shuffleFirst', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Draw a card
    drawCard(source) {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:draw', { source }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Play a meld
    playMeld(cardIds) {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:playMeld', { cardIds }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Add card to existing meld
    addToMeld(cardId, meldId, position) {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:addToMeld', { cardId, meldId, position }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Rearrange table
    rearrangeTable(proposedMelds, cardsFromHand) {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:rearrange', { proposedMelds, cardsFromHand }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Discard a card
    discard(cardId) {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:discard', { cardId }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // End turn (going out)
    endTurn() {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:endTurn', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Play again - reset lobby for new game
    playAgain() {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:playAgain', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    // Reconnect to game after disconnect
    reconnectToGame() {
        return new Promise((resolve, reject) => {
            this.socket.emit('game:reconnect',
                { lobbyCode: this.lobbyCode, playerId: this.playerId },
                (response) => {
                    if (response.success) {
                        resolve(response);
                    } else {
                        // Clear session if reconnect fails
                        this.clearSession();
                        reject(new Error(response.error));
                    }
                }
            );
        });
    }

    // Save session for reconnection
    saveSession() {
        if (this.playerId && this.lobbyCode) {
            const session = {
                playerId: this.playerId,
                lobbyCode: this.lobbyCode,
                playerName: this.playerName,
                timestamp: Date.now()
            };
            localStorage.setItem('ginrummy_session', JSON.stringify(session));
            console.log('Session saved:', session);
        }
    }

    // Load saved session
    loadSession() {
        try {
            const session = JSON.parse(localStorage.getItem('ginrummy_session'));
            // Session valid for 2 hours
            if (session && Date.now() - session.timestamp < 7200000) {
                this.playerId = session.playerId;
                this.lobbyCode = session.lobbyCode;
                this.playerName = session.playerName;
                console.log('Session loaded:', session);
                return session;
            } else if (session) {
                console.log('Session expired, clearing...');
                this.clearSession();
            }
        } catch (e) {
            console.log('Error loading session:', e);
        }
        return null;
    }

    // Check if there's a valid session to reconnect to
    hasActiveSession() {
        return !!(this.playerId && this.lobbyCode);
    }

    // Clear session
    clearSession() {
        console.log('Clearing session');
        localStorage.removeItem('ginrummy_session');
        this.playerId = null;
        this.lobbyCode = null;
        this.playerName = null;
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }
}

// Export singleton instance
export const socketClient = new SocketClient();
