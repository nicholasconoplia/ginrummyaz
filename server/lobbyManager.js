// Lobby Manager - Handles room creation and player management
// Manages lobbies, player joining/leaving, and game settings

import { v4 as uuidv4 } from 'uuid';

class LobbyManager {
    constructor(io) {
        this.io = io;
        this.lobbies = new Map(); // lobbyCode -> lobby
        this.playerToLobby = new Map(); // socketId -> lobbyCode
    }

    // Generate a unique 6-character lobby code
    generateLobbyCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0/O, 1/I)
        let code;
        do {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += chars[Math.floor(Math.random() * chars.length)];
            }
        } while (this.lobbies.has(code));
        return code;
    }

    // Create a new lobby
    createLobby(hostSocket, playerName, settings = {}) {
        const code = this.generateLobbyCode();
        const playerId = uuidv4();

        const lobby = {
            code,
            host: hostSocket.id,
            players: [{
                id: hostSocket.id,
                odId: playerId,
                name: playerName,
                connected: true,
                isHost: true,
                isTestPlayer: false
            }],
            settings: {
                numDecks: settings.numDecks || 1,
                maxPlayers: settings.maxPlayers || 10,
                deckStyle: settings.deckStyle || 'default' // 'default' or 'custom'
            },
            status: 'waiting', // 'waiting' | 'playing' | 'finished'
            createdAt: Date.now(),
            testPlayerCount: 0
        };

        this.lobbies.set(code, lobby);
        this.playerToLobby.set(hostSocket.id, code);
        hostSocket.join(code);

        return { code, lobby, playerId };
    }

    // Join an existing lobby
    joinLobby(socket, lobbyCode, playerName) {
        const code = lobbyCode.toUpperCase();
        const lobby = this.lobbies.get(code);

        if (!lobby) {
            return { success: false, error: 'Lobby not found. Check the code and try again.' };
        }

        if (lobby.status !== 'waiting') {
            return { success: false, error: 'Game has already started.' };
        }

        if (lobby.players.length >= lobby.settings.maxPlayers) {
            return { success: false, error: 'Lobby is full.' };
        }

        // Check for duplicate names
        if (lobby.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return { success: false, error: 'Name already taken. Please choose a different name.' };
        }

        const playerId = uuidv4();
        const player = {
            id: socket.id,
            odId: playerId,
            name: playerName,
            connected: true,
            isHost: false,
            isTestPlayer: false
        };

        lobby.players.push(player);
        this.playerToLobby.set(socket.id, code);
        socket.join(code);

        return { success: true, lobby, playerId };
    }

    // Leave a lobby
    leaveLobby(socketId) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return null;

        const lobby = this.lobbies.get(code);
        if (!lobby) return null;

        // Remove player
        const playerIndex = lobby.players.findIndex(p => p.id === socketId);
        if (playerIndex !== -1) {
            const removedPlayer = lobby.players.splice(playerIndex, 1)[0];
            this.playerToLobby.delete(socketId);

            // If host left and there are other players, assign new host
            if (removedPlayer.isHost && lobby.players.length > 0) {
                lobby.players[0].isHost = true;
                lobby.host = lobby.players[0].id;
            }

            // If lobby is empty, delete it
            if (lobby.players.length === 0) {
                this.lobbies.delete(code);
                return { code, lobby: null, removed: true };
            }

            return { code, lobby, removed: false };
        }

        return null;
    }

    // Mark player as disconnected (for reconnection)
    playerDisconnected(socketId) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return null;

        const lobby = this.lobbies.get(code);
        if (!lobby) return null;

        const player = lobby.players.find(p => p.id === socketId);
        if (player) {
            player.connected = false;
            return { code, lobby };
        }

        return null;
    }

    // Reconnect a player
    reconnectPlayer(socket, lobbyCode, playerId) {
        const code = lobbyCode.toUpperCase();
        const lobby = this.lobbies.get(code);

        if (!lobby) {
            return { success: false, error: 'Lobby not found' };
        }

        const player = lobby.players.find(p => p.odId === playerId);
        if (!player) {
            return { success: false, error: 'Player not found in lobby' };
        }

        // Update socket ID and reconnect
        const oldSocketId = player.id;
        this.playerToLobby.delete(oldSocketId);

        player.id = socket.id;
        player.connected = true;
        this.playerToLobby.set(socket.id, code);
        socket.join(code);

        return { success: true, lobby, player };
    }

    // Get lobby by code
    getLobby(code) {
        return this.lobbies.get(code.toUpperCase());
    }

    // Get lobby by socket ID
    getLobbyBySocket(socketId) {
        const code = this.playerToLobby.get(socketId);
        return code ? this.lobbies.get(code) : null;
    }

    // Update lobby settings
    updateSettings(socketId, settings) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return { success: false, error: 'Not in a lobby' };

        const lobby = this.lobbies.get(code);
        if (!lobby) return { success: false, error: 'Lobby not found' };

        // Only host can change settings
        if (lobby.host !== socketId) {
            return { success: false, error: 'Only the host can change settings' };
        }

        if (lobby.status !== 'waiting') {
            return { success: false, error: 'Cannot change settings after game started' };
        }

        lobby.settings = { ...lobby.settings, ...settings };
        return { success: true, lobby };
    }

    // Start the game
    startGame(socketId) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return { success: false, error: 'Not in a lobby' };

        const lobby = this.lobbies.get(code);
        if (!lobby) return { success: false, error: 'Lobby not found' };

        if (lobby.host !== socketId) {
            return { success: false, error: 'Only the host can start the game' };
        }

        if (lobby.players.length < 2) {
            return { success: false, error: 'Need at least 2 players to start' };
        }

        lobby.status = 'playing';
        return { success: true, lobby };
    }

    // Get public lobby info (for display)
    getPublicLobbyInfo(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby) return null;

        return {
            code: lobby.code,
            players: lobby.players.map(p => ({
                name: p.name,
                isHost: p.isHost,
                connected: p.connected,
                isTestPlayer: p.isTestPlayer || false
            })),
            settings: lobby.settings,
            status: lobby.status,
            playerCount: lobby.players.length,
            firstPlayerIndex: lobby.firstPlayerIndex,
            host: lobby.host
        };
    }

    // Add a test player (bot) for testing
    addTestPlayer(socketId) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return { success: false, error: 'Not in a lobby' };

        const lobby = this.lobbies.get(code);
        if (!lobby) return { success: false, error: 'Lobby not found' };

        if (lobby.status !== 'waiting') {
            return { success: false, error: 'Cannot add test players after game started' };
        }

        if (lobby.players.length >= lobby.settings.maxPlayers) {
            return { success: false, error: 'Lobby is full' };
        }

        lobby.testPlayerCount++;
        const testNames = ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Diana', 'Bot Eve', 'Bot Frank', 'Bot Grace', 'Bot Henry', 'Bot Ivy'];
        const testName = testNames[(lobby.testPlayerCount - 1) % testNames.length];

        const playerId = uuidv4();
        const testPlayer = {
            id: `test_${playerId}`,
            odId: playerId,
            name: testName,
            connected: true,
            isHost: false,
            isTestPlayer: true
        };

        lobby.players.push(testPlayer);

        return { success: true, lobby, testPlayer };
    }

    // Remove a test player
    removeTestPlayer(socketId, testPlayerId) {
        const code = this.playerToLobby.get(socketId);
        if (!code) return { success: false, error: 'Not in a lobby' };

        const lobby = this.lobbies.get(code);
        if (!lobby) return { success: false, error: 'Lobby not found' };

        if (lobby.status !== 'waiting') {
            return { success: false, error: 'Cannot remove test players after game started' };
        }

        const playerIndex = lobby.players.findIndex(p => p.id === testPlayerId && p.isTestPlayer);
        if (playerIndex === -1) {
            return { success: false, error: 'Test player not found' };
        }

        lobby.players.splice(playerIndex, 1);
        return { success: true, lobby };
    }

    // Reset lobby for a new game (Play Again)
    resetLobbyForNewGame(lobbyCode) {
        const code = lobbyCode.toUpperCase();
        const lobby = this.lobbies.get(code);

        if (!lobby) {
            return { success: false, error: 'Lobby not found' };
        }

        // Reset lobby status to waiting
        lobby.status = 'waiting';
        
        // Rotate first player to the next person
        if (lobby.firstPlayerIndex !== undefined && lobby.players.length > 0) {
            lobby.firstPlayerIndex = (lobby.firstPlayerIndex + 1) % lobby.players.length;
        }

        return { success: true, lobby };
    }

    // Shuffle to randomly determine first player
    shuffleFirstPlayer(lobbyCode) {
        const code = lobbyCode.toUpperCase();
        const lobby = this.lobbies.get(code);

        if (!lobby) {
            return { success: false, error: 'Lobby not found' };
        }

        if (lobby.players.length < 2) {
            return { success: false, error: 'Need at least 2 players to shuffle' };
        }

        // Random index
        const randomIndex = Math.floor(Math.random() * lobby.players.length);
        lobby.firstPlayerIndex = randomIndex;

        const firstPlayer = lobby.players[randomIndex];

        return { 
            success: true, 
            lobby,
            firstPlayerIndex: randomIndex,
            firstPlayerName: firstPlayer.name
        };
    }
}

export default LobbyManager;
