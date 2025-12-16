// Server Entry Point - Express + Socket.IO
// Handles all WebSocket events and serves the client

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import LobbyManager from './lobbyManager.js';
import GameManager from './gameManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO with CORS
// In production, allow connections from the same origin or specified ALLOWED_ORIGINS
const getAllowedOrigins = () => {
    if (process.env.NODE_ENV === 'production') {
        // In production, allow from same origin (handled by cors: false or true)
        // If you deploy to a custom domain, you can set ALLOWED_ORIGINS env var
        const allowedOrigins = process.env.ALLOWED_ORIGINS;
        if (allowedOrigins) {
            return allowedOrigins.split(',').map(origin => origin.trim());
        }
        // Allow all origins in production for easier deployment
        return true;
    }
    // Development origins
    return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];
};

const io = new Server(httpServer, {
    cors: {
        origin: getAllowedOrigins(),
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Increase ping timeout to handle slow/unstable connections
    pingTimeout: 60000, // 60 seconds (default is 20s) - time to wait for pong response
    pingInterval: 25000, // Send ping every 25 seconds (default is 25s)
    // Allow connections to upgrade from polling to websocket
    transports: ['websocket', 'polling'],
    // Connection timeout
    connectTimeout: 20000, // 20 seconds
});

// Initialize managers
const lobbyManager = new LobbyManager(io);
const gameManager = new GameManager(io);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../dist')));
    // Express 5 (path-to-regexp v6) does not accept '*' as a route pattern.
    // Use a RegExp to catch-all and serve the SPA entrypoint.
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // ============ LOBBY EVENTS ============

    // Create a new lobby
    socket.on('lobby:create', ({ playerName, settings }, callback) => {
        try {
            const { code, lobby, playerId } = lobbyManager.createLobby(socket, playerName, settings);
            console.log(`Lobby created: ${code} by ${playerName}`);
            callback({
                success: true,
                code,
                playerId,
                lobby: lobbyManager.getPublicLobbyInfo(code)
            });
        } catch (error) {
            callback({ success: false, error: error.message });
        }
    });

    // Join existing lobby
    socket.on('lobby:join', ({ lobbyCode, playerName, playerId }, callback) => {
        try {
            const result = lobbyManager.joinLobby(socket, lobbyCode, playerName, playerId);
            if (result.success) {
                const code = lobbyCode.toUpperCase();
                console.log(`${playerName} ${result.isReconnection ? 'reconnected to' : 'joined'} lobby: ${code}`);
                const publicInfo = lobbyManager.getPublicLobbyInfo(code);

                // If this is a reconnection and game is in progress, handle game reconnection
                if (result.isReconnection && publicInfo.status === 'playing') {
                    // Update game manager with new socket ID
                    const gameReconnected = gameManager.playerReconnected(
                        code, 
                        result.playerId, 
                        socket.id, 
                        result.oldSocketId
                    );

                    if (gameReconnected) {
                        // Get the current game state for the reconnecting player
                        const playerView = gameManager.getPlayerView(code, socket.id);
                        if (playerView) {
                            console.log(`Player reconnected to active game in ${code}`);
                            
                            // Notify all players in lobby about reconnection
                            io.to(code).emit('lobby:playerJoined', publicInfo);
                            
                            callback({
                                success: true,
                                playerId: result.playerId,
                                lobby: publicInfo,
                                gameState: playerView,
                                isReconnection: true
                            });
                            
                            // Broadcast updated state to all players
                            setTimeout(() => broadcastGameState(code), 100);
                            return;
                        }
                    }
                }

                // Normal join or reconnection to waiting lobby
                // Notify all players in lobby
                io.to(code).emit('lobby:playerJoined', publicInfo);

                callback({
                    success: true,
                    playerId: result.playerId,
                    lobby: publicInfo,
                    isReconnection: result.isReconnection || false
                });
            } else {
                callback(result);
            }
        } catch (error) {
            callback({ success: false, error: error.message });
        }
    });

    // Leave lobby
    socket.on('lobby:leave', (callback) => {
        const result = lobbyManager.leaveLobby(socket.id);
        if (result) {
            socket.leave(result.code);
            if (result.lobby) {
                io.to(result.code).emit('lobby:playerLeft', lobbyManager.getPublicLobbyInfo(result.code));
            }
            callback?.({ success: true });
        } else {
            callback?.({ success: false, error: 'Not in a lobby' });
        }
    });

    // Update lobby settings (host only)
    socket.on('lobby:updateSettings', ({ settings }, callback) => {
        const result = lobbyManager.updateSettings(socket.id, settings);
        if (result.success) {
            const code = result.lobby.code;
            io.to(code).emit('lobby:settingsUpdated', lobbyManager.getPublicLobbyInfo(code));
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Add test player (for testing/development)
    socket.on('lobby:addTestPlayer', (callback) => {
        const result = lobbyManager.addTestPlayer(socket.id);
        if (result.success) {
            const code = result.lobby.code;
            console.log(`Test player ${result.testPlayer.name} added to lobby: ${code}`);
            io.to(code).emit('lobby:playerJoined', lobbyManager.getPublicLobbyInfo(code));
            callback({ success: true, testPlayer: result.testPlayer });
        } else {
            callback(result);
        }
    });

    // Shuffle to determine first player
    socket.on('lobby:shuffleFirst', (callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a lobby' });

        const result = lobbyManager.shuffleFirstPlayer(lobby.code);
        if (result.success) {
            console.log(`First player shuffled in lobby ${lobby.code}: ${result.firstPlayerName}`);
            
            // Broadcast to all players
            io.to(lobby.code).emit('lobby:firstPlayerUpdated', {
                firstPlayerIndex: result.firstPlayerIndex,
                firstPlayerName: result.firstPlayerName,
                lobby: lobbyManager.getPublicLobbyInfo(lobby.code)
            });
            
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Start game (host only)
    socket.on('game:start', (callback) => {
        const result = lobbyManager.startGame(socket.id);
        if (result.success) {
            const lobby = result.lobby;
            // Pass first player index if set
            const firstPlayerIndex = lobby.firstPlayerIndex !== undefined ? lobby.firstPlayerIndex : 0;
            const gameState = gameManager.initGame(lobby.code, lobby.players, lobby.settings, firstPlayerIndex);

            console.log(`Game started in lobby: ${lobby.code}`);

            // Send initial game state to each player (with hidden hands)
            // For test players, we don't emit to them (they have fake socket IDs)
            for (const player of lobby.players) {
                if (!player.isTestPlayer) {
                    const playerView = gameManager.getPlayerView(lobby.code, player.id);
                    const playerIndex = lobby.players.findIndex(p => p.id === player.id);
                    
                    // Add dealing animation data
                    io.to(player.id).emit('game:started', {
                        ...playerView,
                        shouldAnimate: true,
                        myPlayerIndex: playerIndex,
                        totalPlayers: lobby.players.length,
                        playerNames: lobby.players.map(p => p.name)
                    });
                }
            }

            callback({ success: true });

            // Check if first player is a bot after dealing animation completes
            if (gameManager.isCurrentPlayerBot(lobby.code)) {
                setTimeout(() => {
                    processBotTurns(lobby.code);
                }, 3000); // Wait for dealing animation
            }
        } else {
            callback(result);
        }
    });

    // Forward declaration for processBotTurns (defined later)
    let processBotTurns;

    // ============ GAME EVENTS ============

    // Draw a card
    socket.on('game:draw', ({ source }, callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const player = lobby.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'Unknown';
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        const result = gameManager.drawCard(lobby.code, socket.id, source);
        if (result.success) {
            // Broadcast the action to all players for animation
            // The drawing player sees the card, others see the back
            for (const p of lobby.players) {
                if (p.connected && !p.isTestPlayer) {
                    const isDrawingPlayer = p.id === socket.id;
                    io.to(p.id).emit('game:action', {
                        type: 'draw',
                        playerId: socket.id,
                        playerName,
                        playerIndex,
                        source, // 'deck' or 'discard'
                        card: isDrawingPlayer ? result.card : null, // Only show card to drawing player
                        cardForDiscard: source === 'discard' ? result.card : null // Everyone sees discard card being taken
                    });
                }
            }
            
            // Send updated state after a delay for animation
            setTimeout(() => broadcastGameState(lobby.code), 400);
            callback({ success: true, card: result.card });
        } else {
            callback(result);
        }
    });

    // Play a meld
    socket.on('game:playMeld', ({ cardIds }, callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const player = lobby.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'Unknown';
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        // Get cards info before playing (for animation)
        const gameState = gameManager.getFullState(lobby.code);
        const playerInGame = gameState?.players.find(p => p.id === socket.id);
        const cardsToPlay = cardIds.map(id => playerInGame?.hand.find(c => c.id === id)).filter(Boolean);

        const result = gameManager.playMeld(lobby.code, socket.id, cardIds);
        if (result.success) {
            // Broadcast the action to all players for animation
            io.to(lobby.code).emit('game:action', {
                type: 'playMeld',
                playerId: socket.id,
                playerName,
                playerIndex,
                cards: cardsToPlay,
                cardCount: cardsToPlay.length
            });
            
            // Send updated state after animation
            setTimeout(() => broadcastGameState(lobby.code), 500);
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Add card to existing meld
    socket.on('game:addToMeld', ({ cardId, meldId, position }, callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const player = lobby.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'Unknown';
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        // Get card info before adding (for animation)
        const gameState = gameManager.getFullState(lobby.code);
        const playerInGame = gameState?.players.find(p => p.id === socket.id);
        const cardToAdd = playerInGame?.hand.find(c => c.id === cardId);

        const result = gameManager.addToMeld(lobby.code, socket.id, cardId, meldId, position);
        if (result.success) {
            // Broadcast the action to all players for animation
            io.to(lobby.code).emit('game:action', {
                type: 'addToMeld',
                playerId: socket.id,
                playerName,
                playerIndex,
                card: cardToAdd,
                meldId,
                position
            });
            
            // Send updated state after animation
            setTimeout(() => broadcastGameState(lobby.code), 400);
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Rearrange table
    socket.on('game:rearrange', ({ proposedMelds, cardsFromHand }, callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const player = lobby.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'Unknown';
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        // Get cards from hand before rearranging (for animation)
        const gameState = gameManager.getFullState(lobby.code);
        const playerInGame = gameState?.players.find(p => p.id === socket.id);
        const cardsPlayed = cardsFromHand.map(id => playerInGame?.hand.find(c => c.id === id)).filter(Boolean);

        const result = gameManager.rearrangeTable(lobby.code, socket.id, proposedMelds, cardsFromHand);
        if (result.success) {
            // Broadcast the action to all players for animation
            io.to(lobby.code).emit('game:action', {
                type: 'rearrange',
                playerId: socket.id,
                playerName,
                playerIndex,
                cardsFromHand: cardsPlayed,
                newMelds: proposedMelds
            });
            
            // Send updated state after animation
            setTimeout(() => broadcastGameState(lobby.code), 600);
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Discard and end turn
    socket.on('game:discard', ({ cardId }, callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const player = lobby.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : 'Unknown';
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        // Get card info before discarding (for animation)
        const gameState = gameManager.getFullState(lobby.code);
        const playerInGame = gameState?.players.find(p => p.id === socket.id);
        const cardToDiscard = playerInGame?.hand.find(c => c.id === cardId);

        const result = gameManager.discard(lobby.code, socket.id, cardId);
        if (result.success) {
            // Broadcast the action to all players for animation
            io.to(lobby.code).emit('game:action', {
                type: 'discard',
                playerId: socket.id,
                playerName,
                playerIndex,
                card: cardToDiscard // Everyone can see what card was discarded
            });

            if (result.winner) {
                // Game over after animation
                setTimeout(() => {
                    io.to(lobby.code).emit('game:over', result.winner);
                }, 600);
            } else {
                // Send updated state after animation
                setTimeout(() => broadcastGameState(lobby.code), 500);
            }
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // End turn without discard (going out)
    socket.on('game:endTurn', (callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a game' });

        const result = gameManager.endTurn(lobby.code, socket.id);
        if (result.success) {
            io.to(lobby.code).emit('game:over', result.winner);
            callback({ success: true });
        } else {
            callback(result);
        }
    });

    // Play Again - Reset lobby for a new game
    socket.on('game:playAgain', (callback) => {
        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (!lobby) return callback({ success: false, error: 'Not in a lobby' });

        // Remove the old game state
        gameManager.removeGame(lobby.code);

        // Reset lobby status to waiting
        const result = lobbyManager.resetLobbyForNewGame(lobby.code);
        if (result.success) {
            console.log(`Play again requested in lobby: ${lobby.code}`);
            
            // Get updated lobby info and broadcast to all players
            const publicInfo = lobbyManager.getPublicLobbyInfo(lobby.code);
            io.to(lobby.code).emit('lobby:reset', publicInfo);
            
            callback({ success: true, lobby: publicInfo });
        } else {
            callback(result);
        }
    });

    // ============ DISCONNECT ============

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        const lobby = lobbyManager.getLobbyBySocket(socket.id);
        if (lobby) {
            // Mark as disconnected (for both waiting and playing lobbies)
            // This allows reconnection to work properly
            lobbyManager.playerDisconnected(socket.id);
            
            if (lobby.status === 'playing') {
                // Also mark in game manager if game is in progress
                gameManager.playerDisconnected(lobby.code, socket.id);
                broadcastGameState(lobby.code);
            } else {
                // For waiting lobbies, notify other players about disconnection
                io.to(lobby.code).emit('lobby:playerJoined', lobbyManager.getPublicLobbyInfo(lobby.code));
                
                // Set a timeout to remove disconnected players from waiting lobbies after 5 minutes
                // This prevents abandoned lobbies from persisting forever
                setTimeout(() => {
                    const stillLobby = lobbyManager.getLobby(lobby.code);
                    if (stillLobby) {
                        const player = stillLobby.players.find(p => p.id === socket.id);
                        if (player && !player.connected && stillLobby.status === 'waiting') {
                            // Player still disconnected after timeout, remove them
                            const result = lobbyManager.leaveLobby(socket.id);
                            if (result && result.lobby) {
                                io.to(result.code).emit('lobby:playerLeft', lobbyManager.getPublicLobbyInfo(result.code));
                            }
                        }
                    }
                }, 5 * 60 * 1000); // 5 minutes
            }
        }
    });

    // Reconnect to game
    socket.on('game:reconnect', ({ lobbyCode, playerId }, callback) => {
        console.log(`Reconnection attempt: lobby=${lobbyCode}, playerId=${playerId}`);
        
        const result = lobbyManager.reconnectPlayer(socket, lobbyCode, playerId);
        if (result.success) {
            const code = lobbyCode.toUpperCase();
            const lobby = lobbyManager.getLobby(code);
            const oldSocketId = result.oldSocketId; // Get old socket ID from lobby manager
            
            // Notify all players in lobby about reconnection
            const publicInfo = lobbyManager.getPublicLobbyInfo(code);
            io.to(code).emit('lobby:playerJoined', publicInfo);
            
            // Update game manager with new socket ID if game is active
            if (lobby && lobby.status === 'playing') {
                gameManager.playerReconnected(code, playerId, socket.id, oldSocketId);
                const playerView = gameManager.getPlayerView(code, socket.id);
                if (playerView) {
                    console.log(`Player reconnected to active game in ${code}`);
                    callback({ success: true, gameState: playerView, lobby: publicInfo });
                    
                    // Broadcast updated state to all players
                    setTimeout(() => broadcastGameState(code), 100);
                    return;
                }
            }
            
            // No active game, just lobby (or game not found)
            console.log(`Player reconnected to lobby ${code} (no active game)`);
            callback({ success: true, lobby: publicInfo });
        } else {
            console.log(`Reconnection failed: ${result.error}`);
            callback(result);
        }
    });

    // Helper: Broadcast game state to all players
    function broadcastGameState(lobbyCode) {
        const lobby = lobbyManager.getLobby(lobbyCode);
        if (!lobby) return;

        for (const player of lobby.players) {
            if (player.connected && !player.isTestPlayer) {
                const playerView = gameManager.getPlayerView(lobbyCode, player.id);
                if (playerView) {
                    io.to(player.id).emit('game:state', playerView);
                }
            }
        }

        // Check if next player is a bot and play their turn
        processBotTurns(lobbyCode);
    }

    // Helper: Process all consecutive bot turns
    processBotTurns = function (lobbyCode) {
        // Add a small delay so players can see the state change
        setTimeout(() => {
            if (gameManager.isCurrentPlayerBot(lobbyCode)) {
                const result = gameManager.playBotTurn(lobbyCode);

                if (result && result.winner) {
                    // Game over
                    io.to(lobbyCode).emit('game:over', result.winner);
                } else if (result && result.success) {
                    // Broadcast new state and check for more bots
                    broadcastGameState(lobbyCode);
                }
            }
        }, 800); // 800ms delay so human players can see bot actions
    };
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`🃏 Gin Rummy server running on port ${PORT}`);
});
