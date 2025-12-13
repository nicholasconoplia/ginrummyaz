// Lobby UI handling
// Manages home screen, waiting room, and lobby interactions

import { socketClient } from './socket.js';
import { showToast } from './main.js';

// DOM Elements
let elements = {};

// Current lobby state
let currentLobby = null;
let isHost = false;
let numDecks = 1;
let deckStyle = 'default';
let firstPlayerIndex = null; // Who goes first

// Initialize lobby module
export function initLobby() {
    cacheElements();
    setupEventListeners();
    loadSavedName();
}

// Cache DOM elements
function cacheElements() {
    elements = {
        // Home screen
        playerName: document.getElementById('player-name'),
        createLobbyBtn: document.getElementById('create-lobby-btn'),
        lobbyCodeInput: document.getElementById('lobby-code-input'),
        joinLobbyBtn: document.getElementById('join-lobby-btn'),

        // Waiting room
        leaveLobbyBtn: document.getElementById('leave-lobby-btn'),
        lobbyCode: document.getElementById('lobby-code'),
        copyCodeBtn: document.getElementById('copy-code-btn'),
        playerCount: document.getElementById('player-count'),
        playersList: document.getElementById('players-list'),
        addTestPlayerBtn: document.getElementById('add-test-player-btn'),
        hostSettings: document.getElementById('host-settings'),
        decksMinus: document.getElementById('decks-minus'),
        decksPlus: document.getElementById('decks-plus'),
        numDecksDisplay: document.getElementById('num-decks-display'),
        deckDefaultBtn: document.getElementById('deck-default-btn'),
        deckCustomBtn: document.getElementById('deck-custom-btn'),
        startGameBtn: document.getElementById('start-game-btn'),
        waitingMessage: document.getElementById('waiting-message'),
        
        // First player selection
        firstPlayerDisplay: document.getElementById('first-player-display'),
        firstPlayerName: document.getElementById('first-player-name'),
        shuffleFirstBtn: document.getElementById('shuffle-first-btn')
    };
}

// Setup event listeners
function setupEventListeners() {
    // Create lobby
    elements.createLobbyBtn.addEventListener('click', handleCreateLobby);

    // Join lobby
    elements.joinLobbyBtn.addEventListener('click', handleJoinLobby);
    elements.lobbyCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoinLobby();
    });

    // Format lobby code input
    elements.lobbyCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // Save name on change
    elements.playerName.addEventListener('change', () => {
        localStorage.setItem('ginrummy_name', elements.playerName.value);
    });

    // Leave lobby
    elements.leaveLobbyBtn.addEventListener('click', handleLeaveLobby);

    // Copy code
    elements.copyCodeBtn.addEventListener('click', handleCopyCode);

    // Deck settings
    elements.decksMinus.addEventListener('click', () => updateDecks(-1));
    elements.decksPlus.addEventListener('click', () => updateDecks(1));

    // Deck style toggle
    elements.deckDefaultBtn.addEventListener('click', () => updateDeckStyle('default'));
    elements.deckCustomBtn.addEventListener('click', () => updateDeckStyle('custom'));

    // Add test player
    elements.addTestPlayerBtn.addEventListener('click', handleAddTestPlayer);

    // Start game
    elements.startGameBtn.addEventListener('click', handleStartGame);
    
    // Shuffle first player
    elements.shuffleFirstBtn.addEventListener('click', handleShuffleFirst);

    // Socket events
    socketClient.on('lobby:playerJoined', handlePlayerJoined);
    socketClient.on('lobby:playerLeft', handlePlayerLeft);
    socketClient.on('lobby:settingsUpdated', handleSettingsUpdated);
    socketClient.on('lobby:reset', handleLobbyReset);
    socketClient.on('lobby:firstPlayerUpdated', handleFirstPlayerUpdated);
}

// Load saved player name
function loadSavedName() {
    const savedName = localStorage.getItem('ginrummy_name');
    if (savedName) {
        elements.playerName.value = savedName;
    }
}

// Get and validate player name
function getPlayerName() {
    const name = elements.playerName.value.trim();
    if (!name) {
        showToast('Please enter your name', 'warning');
        elements.playerName.focus();
        return null;
    }
    if (name.length < 2) {
        showToast('Name must be at least 2 characters', 'warning');
        elements.playerName.focus();
        return null;
    }
    return name;
}

// Create lobby handler
async function handleCreateLobby() {
    const name = getPlayerName();
    if (!name) return;

    elements.createLobbyBtn.disabled = true;

    try {
        const response = await socketClient.createLobby(name, { numDecks, deckStyle });
        currentLobby = response.lobby;
        isHost = true;
        showWaitingRoom();
        showToast('Lobby created! Share the code with friends.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.createLobbyBtn.disabled = false;
    }
}

// Join lobby handler
async function handleJoinLobby() {
    const name = getPlayerName();
    if (!name) return;

    const code = elements.lobbyCodeInput.value.trim();
    if (!code) {
        showToast('Please enter a lobby code', 'warning');
        elements.lobbyCodeInput.focus();
        return;
    }
    if (code.length !== 6) {
        showToast('Lobby code must be 6 characters', 'warning');
        elements.lobbyCodeInput.focus();
        return;
    }

    elements.joinLobbyBtn.disabled = true;

    try {
        const response = await socketClient.joinLobby(code, name);
        currentLobby = response.lobby;
        isHost = false;
        showWaitingRoom();
        showToast(`Joined lobby ${code}!`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.joinLobbyBtn.disabled = false;
    }
}

// Leave lobby handler
async function handleLeaveLobby() {
    try {
        await socketClient.leaveLobby();
        currentLobby = null;
        isHost = false;
        showScreen('home-screen');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Copy code handler
async function handleCopyCode() {
    const code = elements.lobbyCode.textContent;
    try {
        await navigator.clipboard.writeText(code);
        showToast('Code copied to clipboard!', 'success');
        elements.copyCodeBtn.textContent = '✓';
        setTimeout(() => {
            elements.copyCodeBtn.textContent = '📋';
        }, 2000);
    } catch (error) {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Code copied!', 'success');
    }
}

// Update number of decks
async function updateDecks(delta) {
    const newValue = Math.max(1, Math.min(4, numDecks + delta));
    if (newValue !== numDecks) {
        numDecks = newValue;
        elements.numDecksDisplay.textContent = numDecks;

        try {
            await socketClient.updateSettings({ numDecks });
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
}

// Update deck style
async function updateDeckStyle(style) {
    if (style === deckStyle) return;

    deckStyle = style;

    // Update UI
    elements.deckDefaultBtn.classList.toggle('active', style === 'default');
    elements.deckCustomBtn.classList.toggle('active', style === 'custom');

    try {
        await socketClient.updateSettings({ deckStyle });
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Add test player handler
async function handleAddTestPlayer() {
    try {
        await socketClient.addTestPlayer();
        showToast('Test player added!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Shuffle first player handler
async function handleShuffleFirst() {
    if (!currentLobby || currentLobby.playerCount < 2) {
        showToast('Need at least 2 players to shuffle', 'warning');
        return;
    }
    
    // Disable button and animate
    elements.shuffleFirstBtn.disabled = true;
    const shuffleIcon = elements.shuffleFirstBtn.querySelector('.shuffle-icon');
    shuffleIcon.classList.add('shuffle-animation');
    
    try {
        await socketClient.shuffleFirstPlayer();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setTimeout(() => {
            shuffleIcon.classList.remove('shuffle-animation');
            elements.shuffleFirstBtn.disabled = false;
        }, 1500);
    }
}

// Start game handler
async function handleStartGame() {
    if (currentLobby.playerCount < 2) {
        showToast('Need at least 2 players to start', 'warning');
        return;
    }

    elements.startGameBtn.disabled = true;

    try {
        await socketClient.startGame();
        // Game start will trigger 'game:started' event handled in game.js
    } catch (error) {
        showToast(error.message, 'error');
        elements.startGameBtn.disabled = false;
    }
}

// Show waiting room
function showWaitingRoom() {
    elements.lobbyCode.textContent = currentLobby.code;
    
    // Initialize first player display
    if (currentLobby.firstPlayerIndex !== undefined) {
        firstPlayerIndex = currentLobby.firstPlayerIndex;
    } else {
        firstPlayerIndex = null;
    }
    updateFirstPlayerDisplay();
    
    updatePlayersList();
    updateHostUI();
    showScreen('waiting-room-screen');
}

// Update players list
function updatePlayersList() {
    elements.playersList.innerHTML = '';
    elements.playerCount.textContent = `(${currentLobby.playerCount}/${currentLobby.settings.maxPlayers})`;

    currentLobby.players.forEach((player, index) => {
        const playerEl = document.createElement('div');
        playerEl.className = `player-item ${player.connected ? '' : 'disconnected'}`;

        const initial = player.name.charAt(0).toUpperCase();
        const isBot = player.isTestPlayer;

        playerEl.innerHTML = `
      <div class="player-avatar" style="${isBot ? 'background: var(--accent-secondary);' : ''}">${isBot ? '🤖' : initial}</div>
      <div class="player-info">
        <span class="player-name">${player.name}</span>
        ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
        ${isBot ? '<span class="test-badge">Test</span>' : ''}
        ${!player.connected && !isBot ? '<span class="player-status">Disconnected</span>' : ''}
      </div>
    `;

        elements.playersList.appendChild(playerEl);
    });

    // Update start button state
    elements.startGameBtn.disabled = currentLobby.playerCount < 2;
}

// Update host-specific UI
function updateHostUI() {
    if (isHost) {
        elements.hostSettings.classList.remove('hidden');
        elements.startGameBtn.classList.remove('hidden');
        elements.waitingMessage.classList.add('hidden');
        numDecks = currentLobby.settings.numDecks;
        deckStyle = currentLobby.settings.deckStyle || 'default';
        elements.numDecksDisplay.textContent = numDecks;
        elements.deckDefaultBtn.classList.toggle('active', deckStyle === 'default');
        elements.deckCustomBtn.classList.toggle('active', deckStyle === 'custom');
    } else {
        elements.hostSettings.classList.add('hidden');
        elements.startGameBtn.classList.add('hidden');
        elements.waitingMessage.classList.remove('hidden');
    }
}

// Handle player joined
function handlePlayerJoined(lobbyData) {
    currentLobby = lobbyData;
    updatePlayersList();
    const newPlayer = lobbyData.players[lobbyData.players.length - 1];
    if (newPlayer.isTestPlayer) {
        showToast(`${newPlayer.name} added for testing`, 'info');
    } else {
        showToast(`${newPlayer.name} joined!`, 'info');
    }
}

// Handle player left
function handlePlayerLeft(lobbyData) {
    currentLobby = lobbyData;
    updatePlayersList();
}

// Handle settings updated
function handleSettingsUpdated(lobbyData) {
    currentLobby = lobbyData;
    if (!isHost) {
        numDecks = lobbyData.settings.numDecks;
        deckStyle = lobbyData.settings.deckStyle || 'default';
        elements.numDecksDisplay.textContent = numDecks;
    }
}

// Handle lobby reset (Play Again)
function handleLobbyReset(lobbyData) {
    currentLobby = lobbyData;
    
    // Re-evaluate host status
    isHost = currentLobby.host === socketClient.socket.id;
    
    // Re-enable the start button
    elements.startGameBtn.disabled = false;
    
    // Update first player (rotated to next person)
    if (lobbyData.firstPlayerIndex !== undefined) {
        firstPlayerIndex = lobbyData.firstPlayerIndex;
        updateFirstPlayerDisplay();
        highlightFirstPlayer();
        
        // Announce the next first player
        if (currentLobby.players[firstPlayerIndex]) {
            showToast(`${currentLobby.players[firstPlayerIndex].name} goes first this round!`, 'info');
        }
    }
    
    // Update the players list
    updatePlayersList();
    
    // Make sure host UI is correct
    updateHostUI();
    
    // Show the waiting room
    showScreen('waiting-room-screen');
    
    showToast('Ready for a new game!', 'success');
}

// Handle first player updated
function handleFirstPlayerUpdated(data) {
    firstPlayerIndex = data.firstPlayerIndex;
    updateFirstPlayerDisplay();
    
    // Also update lobby data
    if (data.lobby) {
        currentLobby = data.lobby;
        updatePlayersList();
    }
    
    // Flash effect on selected player
    highlightFirstPlayer();
    
    showToast(`${data.firstPlayerName} will go first!`, 'success');
}

// Update first player display
function updateFirstPlayerDisplay() {
    if (firstPlayerIndex !== null && currentLobby && currentLobby.players[firstPlayerIndex]) {
        const player = currentLobby.players[firstPlayerIndex];
        elements.firstPlayerName.textContent = player.name;
        elements.firstPlayerName.classList.add('selected');
    } else {
        elements.firstPlayerName.textContent = 'Not selected';
        elements.firstPlayerName.classList.remove('selected');
    }
}

// Highlight first player in list
function highlightFirstPlayer() {
    // Remove previous highlight
    document.querySelectorAll('.player-item.first-player').forEach(el => {
        el.classList.remove('first-player');
    });
    
    // Add highlight to selected player
    if (firstPlayerIndex !== null) {
        const playerItems = elements.playersList.querySelectorAll('.player-item');
        if (playerItems[firstPlayerIndex]) {
            playerItems[firstPlayerIndex].classList.add('first-player');
        }
    }
}

// Show screen helper
export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Export for use in game module
export function getCurrentLobby() {
    return currentLobby;
}

export function getIsHost() {
    return isHost;
}
