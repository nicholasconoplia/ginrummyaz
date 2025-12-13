// Game UI handling
// Manages the main game screen, cards, melds, and game actions

import { socketClient } from './socket.js';
import { showScreen } from './lobby.js';
import {
    createCardElement,
    createMeldElement,
    createDiscardCard,
    sortCards,
    getSelectedCards,
    clearSelection,
    createCardBackElement,
    setDeckStyle
} from './cards.js';
import { showToast } from './main.js';
import { handleGameAction, animateDeal } from './animations.js';

// DOM Elements
let elements = {};

// Current game state
let gameState = null;
let selectedCards = [];
let isSorted = false; // Track if user wants hand sorted
let selectedTableCards = []; // Cards selected from the table

// Rearrange mode state
let isRearrangeMode = false;
let proposedMelds = []; // Temporary meld state during rearrangement
let originalMelds = []; // Original melds before rearrangement (for cancel)
let cardsUsedFromHand = []; // Cards taken from hand during rearrangement

// Drag state (workaround for HTML5 drag-and-drop data access issues)
let currentDragData = null;

// Initialize game module
export function initGame() {
    cacheElements();
    setupEventListeners();
}

// Cache DOM elements
function cacheElements() {
    elements = {
        turnIndicator: document.getElementById('turn-indicator'),
        phaseIndicator: document.getElementById('phase-indicator'),
        leftPlayers: document.getElementById('left-players'),
        topPlayers: document.getElementById('top-players'),
        rightPlayers: document.getElementById('right-players'),
        meldsArea: document.getElementById('melds-area'),
        meldsContainer: document.getElementById('melds-container'),
        deckPile: document.getElementById('deck-pile'),
        deckCount: document.getElementById('deck-count'),
        discardPile: document.getElementById('discard-pile'),
        discardTop: document.getElementById('discard-top'),
        discardCount: document.getElementById('discard-count'),
        playerHand: document.getElementById('player-hand'),
        handCount: document.getElementById('hand-count'),
        sortHandBtn: document.getElementById('sort-hand-btn'),
        rearrangeBtn: document.getElementById('rearrange-btn'),
        playMeldBtn: document.getElementById('play-meld-btn'),
        discardBtn: document.getElementById('discard-btn'),
        actionBar: document.getElementById('action-bar'),
        rearrangeActionBar: document.getElementById('rearrange-action-bar'),
        rearrangeCancelBtn: document.getElementById('rearrange-cancel-btn'),
        rearrangeDoneBtn: document.getElementById('rearrange-done-btn'),
        rearrangeStatusText: document.getElementById('rearrange-status-text'),
        gameMenuBtn: document.getElementById('game-menu-btn'),
        gameMenuModal: document.getElementById('game-menu-modal'),
        closeMenuBtn: document.getElementById('close-menu-btn'),
        leaveGameBtn: document.getElementById('leave-game-btn'),
        viewRulesBtn: document.getElementById('view-rules-btn'),
        // Game over
        winnerName: document.getElementById('winner-name'),
        finalScores: document.getElementById('final-scores'),
        playAgainBtn: document.getElementById('play-again-btn'),
        backToLobbyBtn: document.getElementById('back-to-lobby-btn')
    };
}

// Setup event listeners
function setupEventListeners() {
    // Deck click - draw from deck
    elements.deckPile?.addEventListener('click', () => handleDraw('deck'));

    // Discard click - draw from discard
    elements.discardPile?.addEventListener('click', () => handleDraw('discard'));

    // Sort hand
    elements.sortHandBtn?.addEventListener('click', handleSortHand);

    // Rearrange mode
    elements.rearrangeBtn?.addEventListener('click', enterRearrangeMode);
    elements.rearrangeCancelBtn?.addEventListener('click', cancelRearrangeMode);
    elements.rearrangeDoneBtn?.addEventListener('click', confirmRearrangeMode);

    // Play meld
    elements.playMeldBtn?.addEventListener('click', handlePlayMeld);

    // Discard
    elements.discardBtn?.addEventListener('click', handleDiscard);

    // Card selection change
    document.addEventListener('cardSelectionChanged', updateActionButtons);

    // Game menu
    elements.gameMenuBtn.addEventListener('click', () => {
        elements.gameMenuModal.classList.add('active');
    });

    elements.closeMenuBtn.addEventListener('click', () => {
        elements.gameMenuModal.classList.remove('active');
    });

    elements.leaveGameBtn.addEventListener('click', handleLeaveGame);

    elements.viewRulesBtn.addEventListener('click', () => {
        showToast('Rules: Make runs (3+ same suit in sequence) or sets (3+ same rank). First to play all cards wins!', 'info');
        elements.gameMenuModal.classList.remove('active');
    });

    // Game over actions
    elements.playAgainBtn?.addEventListener('click', handlePlayAgain);
    elements.backToLobbyBtn?.addEventListener('click', handleBackToLobby);

    // Socket events
    socketClient.on('game:started', handleGameStarted);
    socketClient.on('game:state', handleGameState);
    socketClient.on('game:action', handleGameActionEvent);
    socketClient.on('game:over', handleGameOver);
}

// Store my player ID for animation context
let myPlayerId = null;

// Handle game started
function handleGameStarted(state) {
    gameState = state;
    myPlayerId = socketClient.socket?.id;
    
    // Set deck style from game settings
    if (state.settings?.deckStyle) {
        setDeckStyle(state.settings.deckStyle);
    }
    
    showScreen('game-screen');
    
    // Check if we should animate the deal
    if (state.shouldAnimate) {
        // First render everything except the hand
        renderTurnInfo();
        renderOtherPlayers();
        renderDeckAndDiscard();
        renderMelds();
        
        // Show empty hand first
        elements.playerHand.innerHTML = '';
        elements.handCount.textContent = '0 cards';
        
        // Animate dealing
        animateDeal(state, () => {
            // After dealing animation, render the full hand
            if (isSorted) {
                gameState.myHand = sortCards(gameState.myHand);
            }
            renderHand();
            updateActionButtons();
        });
        
        showToast('Dealing cards...', 'info');
        setTimeout(() => {
            showToast('Game started! Good luck!', 'success');
        }, 2000);
    } else {
        renderGame();
        showToast('Game started! Good luck!', 'success');
    }
}

// Handle game state update
function handleGameState(state) {
    gameState = state;
    // Auto-sort if user has sorting enabled
    if (isSorted) {
        gameState.myHand = sortCards(gameState.myHand);
    }
    selectedTableCards = []; // Reset table selections on state change
    
    // Exit rearrange mode if state changes (turn ended, etc.)
    if (isRearrangeMode) {
        exitRearrangeMode();
    }
    
    renderGame();
}

// Handle game action event for animations
function handleGameActionEvent(action) {
    // Get my player ID from socket
    const myId = socketClient.socket?.id || myPlayerId;
    
    // Trigger animations
    handleGameAction(action, myId);
    
    // Add visual feedback to deck/discard elements
    addActionVisualFeedback(action);
    
    // Show notification for other players' actions
    if (action.playerId !== myId) {
        showActionNotification(action);
    }
}

// Add visual feedback to game elements during actions
function addActionVisualFeedback(action) {
    switch (action.type) {
        case 'draw':
            if (action.source === 'deck') {
                elements.deckPile?.classList.add('drawing');
                setTimeout(() => elements.deckPile?.classList.remove('drawing'), 300);
            } else {
                elements.discardPile?.classList.add('attention');
                setTimeout(() => elements.discardPile?.classList.remove('attention'), 300);
            }
            break;
        case 'discard':
            // Delay the receive animation to match when the card lands
            setTimeout(() => {
                elements.discardPile?.classList.add('receiving');
                setTimeout(() => elements.discardPile?.classList.remove('receiving'), 300);
            }, 350);
            break;
        case 'playMeld':
        case 'addToMeld':
        case 'rearrange':
            elements.meldsContainer?.classList.add('attention');
            setTimeout(() => elements.meldsContainer?.classList.remove('attention'), 500);
            break;
    }
}

// Show floating notification for opponent actions
function showActionNotification(action) {
    const notification = document.createElement('div');
    notification.className = 'action-notification';
    
    let message = '';
    switch (action.type) {
        case 'draw':
            message = action.source === 'deck' 
                ? `${action.playerName} drew from deck`
                : `${action.playerName} picked up ${formatCardName(action.cardForDiscard)}`;
            break;
        case 'playMeld':
            message = `${action.playerName} played ${action.cardCount} cards`;
            break;
        case 'addToMeld':
            message = `${action.playerName} added ${formatCardName(action.card)} to a meld`;
            break;
        case 'discard':
            message = `${action.playerName} discarded ${formatCardName(action.card)}`;
            break;
        case 'rearrange':
            message = `${action.playerName} rearranged the table`;
            break;
    }
    
    if (message) {
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after animation
        setTimeout(() => notification.remove(), 2000);
    }
}

// Format card name for notifications
function formatCardName(card) {
    if (!card) return 'a card';
    const suitSymbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    return `${card.rank}${suitSymbols[card.suit] || ''}`;
}

// Handle game over
function handleGameOver(winner) {
    elements.winnerName.textContent = `${winner.playerName} Wins!`;

    // Render scores
    elements.finalScores.innerHTML = '';
    winner.scores.forEach(score => {
        const row = document.createElement('div');
        row.className = `score-row ${score.isWinner ? 'winner' : ''}`;
        row.innerHTML = `
      <span class="score-name">${score.name} ${score.isWinner ? '👑' : ''}</span>
      <span class="score-points">${score.isWinner ? 'Winner!' : `${score.points} points`}</span>
    `;
        elements.finalScores.appendChild(row);
    });

    showScreen('game-over-screen');

    // Create confetti
    createConfetti();
}

// Create confetti effect
function createConfetti() {
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    const container = document.querySelector('.winner-announcement');

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 2}s`;
        confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
        container.appendChild(confetti);

        // Remove after animation
        setTimeout(() => confetti.remove(), 5000);
    }
}

// Render the entire game
function renderGame() {
    if (!gameState) return;

    renderTurnInfo();
    renderOtherPlayers();
    
    // Don't re-render melds/hand in rearrange mode (handled separately)
    if (!isRearrangeMode) {
        renderMelds();
        renderHand();
    }
    
    renderDeckAndDiscard();
    updateActionButtons();
}

// Render turn information
function renderTurnInfo() {
    if (gameState.isMyTurn) {
        elements.turnIndicator.textContent = 'Your Turn';
        elements.turnIndicator.className = 'turn-indicator my-turn';

        if (gameState.phase === 'draw') {
            elements.phaseIndicator.textContent = 'Draw a card from deck or discard';
        } else {
            elements.phaseIndicator.textContent = 'Play melds or discard to end turn';
        }
    } else {
        elements.turnIndicator.textContent = `${gameState.currentPlayerName}'s Turn`;
        elements.turnIndicator.className = 'turn-indicator waiting';
        elements.phaseIndicator.textContent = 'Waiting...';
    }
}

// Render other players around the table
function renderOtherPlayers() {
    elements.leftPlayers.innerHTML = '';
    elements.topPlayers.innerHTML = '';
    elements.rightPlayers.innerHTML = '';

    // Filter out self
    const others = gameState.otherPlayers.filter(p => !p.isMe);

    // Distribute players: left, top, right based on count
    // 1 player: top
    // 2 players: left and right  
    // 3+ players: distribute evenly
    const positions = distributePlayersToPositions(others.length);

    others.forEach((player, index) => {
        const position = positions[index];
        const container = position === 'left' ? elements.leftPlayers :
            position === 'right' ? elements.rightPlayers :
                elements.topPlayers;

        const playerEl = createPlayerElement(player, position);
        container.appendChild(playerEl);
    });
}

// Distribute players to positions around the table
function distributePlayersToPositions(count) {
    if (count === 0) return [];
    if (count === 1) return ['top'];
    if (count === 2) return ['left', 'right'];
    if (count === 3) return ['left', 'top', 'right'];
    if (count === 4) return ['left', 'top', 'top', 'right'];
    // More than 4: fill top
    const positions = ['left'];
    for (let i = 0; i < count - 2; i++) positions.push('top');
    positions.push('right');
    return positions;
}

// Create a player element for the table
function createPlayerElement(player, position) {
    const playerEl = document.createElement('div');
    const isCurrentTurn = gameState.currentPlayerName === player.name;
    playerEl.className = `table-player ${position}-player ${isCurrentTurn ? 'current-turn' : ''}`;

    const initial = player.name.charAt(0).toUpperCase();
    const isVertical = position === 'left' || position === 'right';

    // Create fanned cards
    const cardsHtml = createFannedCardsHtml(player.cardCount, isVertical);

    playerEl.innerHTML = `
      <div class="player-avatar-container ${isCurrentTurn ? 'active' : ''}">
        <div class="player-avatar">${initial}</div>
        <span class="player-name">${player.name}</span>
      </div>
      <div class="player-cards ${isVertical ? 'vertical' : 'horizontal'}">
        ${cardsHtml}
      </div>
    `;

    return playerEl;
}

// Create fanned card backs HTML
function createFannedCardsHtml(count, isVertical) {
    // Calculate card size based on count (scale down for many cards)
    const maxCards = isVertical ? 12 : 15;
    const overlap = isVertical ? 8 : 12;

    let html = `<div class="fanned-cards ${isVertical ? 'vertical' : 'horizontal'}" style="--card-count: ${count}; --overlap: ${overlap}px">`;
    for (let i = 0; i < count; i++) {
        const offset = i * overlap;
        if (isVertical) {
            html += `<div class="fan-card" style="top: ${offset}px"></div>`;
        } else {
            html += `<div class="fan-card" style="left: ${offset}px"></div>`;
        }
    }
    html += '</div>';
    return html;
}

// Render melds on table
function renderMelds() {
    elements.meldsContainer.innerHTML = '';

    if (gameState.melds.length === 0) {
        elements.meldsContainer.innerHTML = '<div class="no-melds">No melds yet</div>';
        return;
    }

    gameState.melds.forEach(meld => {
        const meldEl = createMeldElementSelectable(meld);

        // Add drop target functionality for adding cards
        meldEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            meldEl.classList.add('drop-target');
        });

        meldEl.addEventListener('dragleave', () => {
            meldEl.classList.remove('drop-target');
        });

        meldEl.addEventListener('drop', (e) => {
            e.preventDefault();
            meldEl.classList.remove('drop-target');
            handleDropOnMeld(meld.id, e);
        });

        elements.meldsContainer.appendChild(meldEl);
    });
}

// Create a meld element with selectable cards
function createMeldElementSelectable(meld) {
    const meldEl = document.createElement('div');
    meldEl.className = 'meld-group';
    meldEl.dataset.meldId = meld.id;

    // Sort cards for display (same logic as in cards.js)
    const isRun = meld.cards.length > 0 &&
        meld.cards.every(c => c.suit === meld.cards[0].suit);

    let sortedCards;
    if (isRun) {
        const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        sortedCards = [...meld.cards].sort((a, b) => rankValues[a.rank] - rankValues[b.rank]);

        // Handle Ace-high runs
        if (sortedCards.length >= 3) {
            const hasAce = sortedCards.some(c => c.rank === 'A');
            const hasKing = sortedCards.some(c => c.rank === 'K');
            const hasTwo = sortedCards.some(c => c.rank === '2');
            if (hasAce && hasKing && !hasTwo) {
                const aceIndex = sortedCards.findIndex(c => c.rank === 'A');
                const ace = sortedCards.splice(aceIndex, 1)[0];
                sortedCards.push(ace);
            }
        }
    } else {
        sortedCards = meld.cards;
    }

    sortedCards.forEach(card => {
        const cardEl = createCardElement(card, { selectable: false });

        // Make table cards selectable during play phase
        if (gameState?.isMyTurn && gameState?.phase === 'play') {
            cardEl.style.cursor = 'pointer';
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTableCardSelection(card, meld.id, cardEl);
            });

            // Check if this card is already selected
            const isSelected = selectedTableCards.some(sc => sc.card.id === card.id);
            if (isSelected) {
                cardEl.classList.add('selected');
            }
        }

        meldEl.appendChild(cardEl);
    });

    return meldEl;
}

// Toggle selection of a card from the table
function toggleTableCardSelection(card, meldId, cardEl) {
    const existingIndex = selectedTableCards.findIndex(sc => sc.card.id === card.id);

    if (existingIndex >= 0) {
        // Deselect
        selectedTableCards.splice(existingIndex, 1);
        cardEl.classList.remove('selected');
    } else {
        // Select
        selectedTableCards.push({ card, meldId });
        cardEl.classList.add('selected');
    }

    updateActionButtons();
}

// Handle drop on meld
function handleDropOnMeld(meldId, e) {
    const cardId = e.dataTransfer?.getData('text/plain');
    if (cardId && selectedCards.length === 0) {
        // Find the card in hand
        const card = gameState.myHand.find(c => c.id === cardId);
        if (card) {
            selectedCards = [{ id: cardId, rank: card.rank, suit: card.suit, value: card.value }];
        }
    }
    if (selectedCards.length === 1) {
        handleAddToMeld(meldId);
    }
}

// Render deck and discard pile
function renderDeckAndDiscard() {
    elements.deckCount.textContent = gameState.deckCount;
    elements.discardCount.textContent = gameState.discardCount;

    // Update discard top card
    elements.discardTop.innerHTML = '';
    const discardCard = createDiscardCard(gameState.discardTop);
    elements.discardTop.appendChild(discardCard);

    // Disable/enable based on turn and phase
    // Extra safety: check we're not in rearrange mode
    const canDraw = gameState.isMyTurn && gameState.phase === 'draw' && !isRearrangeMode;
    
    // Force-remove disabled class first, then add if needed
    // This ensures no stale state
    elements.deckPile.classList.remove('disabled');
    elements.discardPile.classList.remove('disabled');
    
    if (!canDraw) {
        elements.deckPile.classList.add('disabled');
        elements.discardPile.classList.add('disabled');
    }
}

// Render player's hand
function renderHand() {
    elements.playerHand.innerHTML = '';
    elements.handCount.textContent = `${gameState.myHand.length} cards`;

    gameState.myHand.forEach((card, index) => {
        const cardEl = createCardElement(card, {
            dealAnimation: false,
            animationDelay: index * 50
        });

        // Make draggable
        cardEl.draggable = true;
        cardEl.dataset.handIndex = index;

        cardEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.id);
            e.dataTransfer.setData('handIndex', index.toString());
            cardEl.classList.add('dragging');
        });

        cardEl.addEventListener('dragend', () => {
            cardEl.classList.remove('dragging');
            document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
        });

        // Allow cards to be drop targets for reordering
        cardEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggedIndex = parseInt(e.dataTransfer.getData('handIndex') || '-1');
            if (draggedIndex !== index) {
                cardEl.classList.add('drop-hover');
            }
        });

        cardEl.addEventListener('dragleave', () => {
            cardEl.classList.remove('drop-hover');
        });

        cardEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove('drop-hover');

            const draggedCardId = e.dataTransfer.getData('text/plain');
            const fromIndex = gameState.myHand.findIndex(c => c.id === draggedCardId);

            if (fromIndex !== -1 && fromIndex !== index) {
                // Reorder the hand
                const [movedCard] = gameState.myHand.splice(fromIndex, 1);
                gameState.myHand.splice(index, 0, movedCard);
                // Disable auto-sort since user is manually ordering
                if (isSorted) {
                    isSorted = false;
                    elements.sortHandBtn.classList.remove('active');
                    showToast('Manual ordering - auto-sort disabled', 'info');
                }
                renderHand();
            }
        });

        elements.playerHand.appendChild(cardEl);
    });

    // Also make the hand container a drop zone
    elements.playerHand.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
}

// Update action button states
function updateActionButtons() {
    selectedCards = getSelectedCards();
    const canPlay = gameState?.isMyTurn && gameState?.phase === 'play';

    // Total selected = hand cards + table cards
    const totalSelected = selectedCards.length + selectedTableCards.length;

    // Play cards - need 3+ selected cards (from hand and/or table)
    elements.playMeldBtn.disabled = !canPlay || totalSelected < 3;

    // Discard - need exactly 1 selected card from hand only
    elements.discardBtn.disabled = !canPlay || selectedCards.length !== 1 || selectedTableCards.length > 0;
    
    // Rearrange button - enabled when it's play phase and there are melds on table
    const hasMelds = gameState?.melds?.length > 0;
    elements.rearrangeBtn.disabled = !canPlay || !hasMelds;
}

// Handle draw card
async function handleDraw(source) {
    // Extra safety check - if we're still in rearrange mode somehow, exit it
    if (isRearrangeMode) {
        console.warn('Draw attempted while in rearrange mode - exiting rearrange mode');
        exitRearrangeMode();
    }
    
    if (!gameState) {
        console.warn('Draw attempted with no game state');
        showToast('Game not ready', 'warning');
        return;
    }
    
    if (!gameState.isMyTurn) {
        console.log('Not my turn, cannot draw');
        return;
    }
    
    if (gameState.phase !== 'draw') {
        console.log('Phase is not draw:', gameState.phase);
        showToast('You already drew a card this turn', 'info');
        return;
    }

    try {
        const response = await socketClient.drawCard(source);
        showToast(`Drew ${response.card.rank} of ${response.card.suit}`, 'info');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Handle sort hand - toggle persistent sorting
function handleSortHand() {
    if (!gameState) return;

    isSorted = !isSorted;
    if (isSorted) {
        gameState.myHand = sortCards(gameState.myHand);
        showToast('Auto-sort enabled', 'success');
    } else {
        showToast('Auto-sort disabled', 'info');
    }
    elements.sortHandBtn.classList.toggle('active', isSorted);
    renderHand();
}

// Handle play meld (including table rearrangement)
async function handlePlayMeld() {
    const totalSelected = selectedCards.length + selectedTableCards.length;

    if (totalSelected < 3) {
        showToast('Select at least 3 cards to play', 'warning');
        return;
    }

    try {
        // If we have both table cards and hand cards, this is a rearrangement
        if (selectedTableCards.length > 0) {
            // Build the new meld from selected cards
            const allCards = [
                ...selectedCards, // Keep full card objects including value
                ...selectedTableCards.map(sc => sc.card)
            ];

            // For now, we'll play as a new meld combining hand and table cards
            // First, we need to send a rearrangement request
            // This requires building the proposed new meld structure

            // Collect affected meld IDs
            const affectedMeldIds = new Set(selectedTableCards.map(sc => sc.meldId));

            // Build proposed melds:
            // 1. Keep existing melds but remove selected cards from them
            // 2. Add new meld with all selected cards
            const proposedMelds = [];

            for (const meld of gameState.melds) {
                const remainingCards = meld.cards.filter(c =>
                    !selectedTableCards.some(sc => sc.card.id === c.id)
                );
                if (remainingCards.length > 0) {
                    proposedMelds.push({ id: meld.id, cards: remainingCards });
                }
            }

            // Add the new meld
            proposedMelds.push({
                id: `meld_${Date.now()}`,
                cards: allCards
            });

            // Cards from hand that are being used
            const cardsFromHand = selectedCards.map(c => c.id);

            await socketClient.rearrangeTable(proposedMelds, cardsFromHand);
            clearSelection();
            selectedTableCards = [];
            showToast('Table rearranged!', 'success');
        } else {
            // Simple meld from hand only
            const cardIds = selectedCards.map(c => c.id);
            await socketClient.playMeld(cardIds);
            clearSelection();
            showToast('Cards played!', 'success');
        }
    } catch (error) {
        showToast(error.message, 'error');
        document.querySelector('.player-hand')?.classList.add('shake');
        setTimeout(() => {
            document.querySelector('.player-hand')?.classList.remove('shake');
        }, 500);
    }
}

// Handle add to existing meld
async function handleAddToMeld(meldId) {
    if (selectedCards.length !== 1) {
        showToast('Select exactly 1 card to add to a meld', 'warning');
        return;
    }

    try {
        // Try adding at end first, then start
        const cardId = selectedCards[0].id;
        try {
            await socketClient.addToMeld(cardId, meldId, 'end');
        } catch {
            await socketClient.addToMeld(cardId, meldId, 'start');
        }
        clearSelection();
        showToast('Card added to meld!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Handle discard
async function handleDiscard() {
    if (selectedCards.length !== 1) {
        showToast('Select exactly 1 card to discard', 'warning');
        return;
    }

    try {
        await socketClient.discard(selectedCards[0].id);
        clearSelection();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ========================================
// REARRANGE MODE FUNCTIONS
// ========================================

// Enter rearrange mode
function enterRearrangeMode() {
    if (!gameState?.isMyTurn || gameState?.phase !== 'play') {
        showToast('Can only rearrange during your play phase', 'warning');
        return;
    }

    isRearrangeMode = true;
    
    // Deep clone the current melds for editing
    originalMelds = JSON.parse(JSON.stringify(gameState.melds));
    proposedMelds = JSON.parse(JSON.stringify(gameState.melds));
    cardsUsedFromHand = [];
    
    // Clear any selections
    clearSelection();
    selectedTableCards = [];
    
    // Update UI
    elements.actionBar.classList.add('hidden');
    elements.rearrangeActionBar.classList.remove('hidden');
    elements.meldsArea.classList.add('rearrange-mode');
    document.body.classList.add('rearrange-mode-active');
    
    // Disable deck/discard during rearrange mode
    elements.deckPile?.classList.add('disabled');
    elements.discardPile?.classList.add('disabled');
    
    showToast('Rearrange mode: Drag cards between melds freely!', 'info');
    
    renderRearrangeMelds();
    renderHandForRearrange();
}

// Exit rearrange mode (reset state)
function exitRearrangeMode() {
    isRearrangeMode = false;
    proposedMelds = [];
    originalMelds = [];
    cardsUsedFromHand = [];
    currentDragData = null; // Clear any lingering drag data
    
    elements.actionBar.classList.remove('hidden');
    elements.rearrangeActionBar.classList.add('hidden');
    elements.meldsArea?.classList.remove('rearrange-mode');
    document.body.classList.remove('rearrange-mode-active');
    
    // Ensure deck/discard piles are reset to correct state
    // This fixes a bug where piles could remain disabled after rearrangement
    if (gameState) {
        const canDraw = gameState.isMyTurn && gameState.phase === 'draw';
        elements.deckPile?.classList.toggle('disabled', !canDraw);
        elements.discardPile?.classList.toggle('disabled', !canDraw);
    }
}

// Cancel rearrange mode
function cancelRearrangeMode() {
    exitRearrangeMode();
    showToast('Rearrangement cancelled', 'info');
    renderGame();
}

// Confirm rearrange mode - validate and send to server
async function confirmRearrangeMode() {
    // Filter out empty melds
    const validMelds = proposedMelds.filter(m => m.cards.length > 0);
    
    // Validate all melds
    const validationErrors = [];
    for (let i = 0; i < validMelds.length; i++) {
        const meld = validMelds[i];
        if (meld.cards.length < 3) {
            validationErrors.push(`Meld ${i + 1} has only ${meld.cards.length} cards (need 3+)`);
        } else if (!isValidMeldLocal(meld.cards)) {
            validationErrors.push(`Meld ${i + 1} is not a valid run or set`);
        }
    }
    
    // Check that all original table cards are still on the table
    const originalCardIds = new Set(originalMelds.flatMap(m => m.cards.map(c => c.id)));
    const proposedCardIds = new Set(validMelds.flatMap(m => m.cards.map(c => c.id)));
    
    for (const id of originalCardIds) {
        if (!proposedCardIds.has(id)) {
            validationErrors.push('Cannot remove cards from table back to hand');
            break;
        }
    }
    
    if (validationErrors.length > 0) {
        showToast(validationErrors[0], 'error');
        updateRearrangeStatus(validationErrors[0]);
        return;
    }
    
    // Check if player would have cards left to discard
    const remainingHandCount = gameState.myHand.length - cardsUsedFromHand.length;
    if (remainingHandCount === 0) {
        showToast('You must keep at least 1 card to discard', 'error');
        return;
    }
    
    try {
        // Send the rearrangement to server
        await socketClient.rearrangeTable(validMelds, cardsUsedFromHand);
        exitRearrangeMode();
        showToast('Table rearranged successfully!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Local meld validation (for real-time feedback)
function isValidMeldLocal(cards) {
    if (cards.length < 3) return false;
    
    // Check for set (same rank)
    const firstRank = cards[0].rank;
    if (cards.every(c => c.rank === firstRank)) {
        return true;
    }
    
    // Check for run (same suit, consecutive)
    const firstSuit = cards[0].suit;
    if (!cards.every(c => c.suit === firstSuit)) {
        return false;
    }
    
    // Sort by value
    const sorted = [...cards].sort((a, b) => a.value - b.value);
    
    // Check consecutive
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].value !== sorted[i - 1].value + 1) {
            // Check for Ace-high run (Q-K-A)
            const hasAce = sorted.some(c => c.rank === 'A');
            if (hasAce) {
                // Re-sort with Ace = 14
                const sortedAceHigh = [...cards].sort((a, b) => {
                    const valA = a.rank === 'A' ? 14 : a.value;
                    const valB = b.rank === 'A' ? 14 : b.value;
                    return valA - valB;
                });
                
                let isAceHighValid = true;
                for (let j = 1; j < sortedAceHigh.length; j++) {
                    const prevVal = sortedAceHigh[j - 1].rank === 'A' ? 14 : sortedAceHigh[j - 1].value;
                    const currVal = sortedAceHigh[j].rank === 'A' ? 14 : sortedAceHigh[j].value;
                    if (currVal !== prevVal + 1) {
                        isAceHighValid = false;
                        break;
                    }
                }
                if (isAceHighValid) return true;
            }
            return false;
        }
    }
    
    return true;
}

// Update rearrange status text
function updateRearrangeStatus(message) {
    if (elements.rearrangeStatusText) {
        elements.rearrangeStatusText.textContent = message;
    }
}

// Render melds in rearrange mode
function renderRearrangeMelds() {
    elements.meldsContainer.innerHTML = '';
    
    // Create a "New Meld" drop zone
    const newMeldZone = document.createElement('div');
    newMeldZone.className = 'meld-drop-zone new-meld-zone';
    newMeldZone.innerHTML = '<span class="drop-icon">+</span>';
    newMeldZone.dataset.meldId = 'new';
    
    newMeldZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        newMeldZone.classList.add('drag-over');
    });
    newMeldZone.addEventListener('dragleave', () => {
        newMeldZone.classList.remove('drag-over');
    });
    newMeldZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        newMeldZone.classList.remove('drag-over');
        handleRearrangeDrop('new');
    });
    
    elements.meldsContainer.appendChild(newMeldZone);
    
    // Render each proposed meld
    proposedMelds.forEach((meld, meldIndex) => {
        if (meld.cards.length === 0) return; // Skip empty melds
        
        const meldEl = document.createElement('div');
        meldEl.className = 'meld-group';
        meldEl.dataset.meldId = meld.id;
        meldEl.dataset.meldIndex = meldIndex;
        
        // Validate and show status
        if (meld.cards.length >= 3) {
            if (isValidMeldLocal(meld.cards)) {
                meldEl.classList.add('valid');
            } else {
                meldEl.classList.add('invalid');
            }
        } else {
            meldEl.classList.add('invalid');
        }
        
        // Sort cards for display
        const sortedCards = sortMeldCards(meld.cards);
        
        sortedCards.forEach(card => {
            const cardEl = createCardElement(card, { selectable: false });
            cardEl.draggable = true;
            cardEl.dataset.sourceMeldId = meld.id;
            cardEl.dataset.cardId = card.id;
            cardEl.style.cursor = 'grab';
            
            cardEl.addEventListener('dragstart', (e) => {
                // Store drag data globally (workaround for cross-browser issues)
                currentDragData = {
                    cardId: card.id,
                    sourceMeldId: meld.id,
                    sourceType: 'table'
                };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify(currentDragData));
                cardEl.classList.add('dragging');
                
                // Add slight delay to allow drag image to appear
                setTimeout(() => {
                    cardEl.style.opacity = '0.5';
                }, 0);
            });
            
            cardEl.addEventListener('dragend', () => {
                cardEl.classList.remove('dragging');
                cardEl.style.opacity = '1';
                currentDragData = null;
            });
            
            meldEl.appendChild(cardEl);
        });
        
        // Drop zone for adding to this meld
        meldEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            meldEl.classList.add('drag-over');
        });
        meldEl.addEventListener('dragleave', (e) => {
            // Only remove if actually leaving the meld, not entering a child
            if (!meldEl.contains(e.relatedTarget)) {
                meldEl.classList.remove('drag-over');
            }
        });
        meldEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            meldEl.classList.remove('drag-over');
            handleRearrangeDrop(meld.id);
        });
        
        elements.meldsContainer.appendChild(meldEl);
    });
    
    updateRearrangeValidation();
}

// Sort meld cards for display
function sortMeldCards(cards) {
    if (cards.length === 0) return cards;
    
    const isRun = cards.every(c => c.suit === cards[0].suit);
    
    if (isRun) {
        const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        const sorted = [...cards].sort((a, b) => rankValues[a.rank] - rankValues[b.rank]);
        
        // Handle Ace-high runs
        if (sorted.length >= 3) {
            const hasAce = sorted.some(c => c.rank === 'A');
            const hasKing = sorted.some(c => c.rank === 'K');
            const hasTwo = sorted.some(c => c.rank === '2');
            if (hasAce && hasKing && !hasTwo) {
                const aceIndex = sorted.findIndex(c => c.rank === 'A');
                const ace = sorted.splice(aceIndex, 1)[0];
                sorted.push(ace);
            }
        }
        return sorted;
    }
    
    return cards;
}

// Handle drop during rearrangement
function handleRearrangeDrop(targetMeldId) {
    // Use global drag data (more reliable than dataTransfer across browsers)
    const data = currentDragData;
    if (!data) {
        return;
    }
    
    const { cardId, sourceMeldId, sourceType } = data;
    
    if (sourceType === 'hand') {
        // Moving card from hand to table
        const card = gameState.myHand.find(c => c.id === cardId);
        if (!card) {
            return;
        }
        
        // Add to cards used from hand
        if (!cardsUsedFromHand.includes(cardId)) {
            cardsUsedFromHand.push(cardId);
        }
        
        if (targetMeldId === 'new') {
            // Create new meld with this card
            proposedMelds.push({
                id: `meld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                cards: [card]
            });
        } else {
            // Add to existing meld
            const targetMeld = proposedMelds.find(m => m.id === targetMeldId);
            if (targetMeld) {
                targetMeld.cards.push(card);
            }
        }
    } else {
        // Moving card between melds on table
        if (sourceMeldId === targetMeldId) {
            return; // Same meld, do nothing
        }
        
        // Find source meld and remove card
        const sourceMeld = proposedMelds.find(m => m.id === sourceMeldId);
        if (!sourceMeld) {
            return;
        }
        
        const cardIndex = sourceMeld.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) {
            return;
        }
        
        const [card] = sourceMeld.cards.splice(cardIndex, 1);
        
        if (targetMeldId === 'new') {
            // Create new meld with this card
            proposedMelds.push({
                id: `meld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                cards: [card]
            });
        } else {
            // Add to existing meld
            const targetMeld = proposedMelds.find(m => m.id === targetMeldId);
            if (targetMeld) {
                targetMeld.cards.push(card);
            }
        }
    }
    
    // Clear drag data
    currentDragData = null;
    
    renderRearrangeMelds();
    renderHandForRearrange();
}

// Render hand during rearrange mode (with used cards marked)
function renderHandForRearrange() {
    elements.playerHand.innerHTML = '';
    
    const availableCards = gameState.myHand.filter(c => !cardsUsedFromHand.includes(c.id));
    elements.handCount.textContent = `${availableCards.length} cards (${cardsUsedFromHand.length} on table)`;
    
    gameState.myHand.forEach((card, index) => {
        const isUsed = cardsUsedFromHand.includes(card.id);
        
        const cardEl = createCardElement(card, {
            dealAnimation: false,
            animationDelay: index * 50,
            selectable: false
        });
        
        if (isUsed) {
            cardEl.style.opacity = '0.3';
            cardEl.style.pointerEvents = 'none';
        } else {
            cardEl.draggable = true;
            cardEl.dataset.cardId = card.id;
            cardEl.style.cursor = 'grab';
            
            cardEl.addEventListener('dragstart', (e) => {
                // Store drag data globally
                currentDragData = {
                    cardId: card.id,
                    sourceType: 'hand'
                };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify(currentDragData));
                cardEl.classList.add('dragging');
                
                setTimeout(() => {
                    cardEl.style.opacity = '0.5';
                }, 0);
            });
            
            cardEl.addEventListener('dragend', () => {
                cardEl.classList.remove('dragging');
                cardEl.style.opacity = '1';
                currentDragData = null;
            });
        }
        
        elements.playerHand.appendChild(cardEl);
    });
}

// Update validation status during rearrangement
function updateRearrangeValidation() {
    const validMelds = proposedMelds.filter(m => m.cards.length > 0);
    let allValid = true;
    let invalidCount = 0;
    
    for (const meld of validMelds) {
        if (meld.cards.length < 3 || !isValidMeldLocal(meld.cards)) {
            allValid = false;
            invalidCount++;
        }
    }
    
    if (allValid && validMelds.length > 0) {
        updateRearrangeStatus('✓ All melds valid - Click Done to confirm');
        elements.rearrangeDoneBtn.disabled = false;
    } else if (invalidCount > 0) {
        updateRearrangeStatus(`${invalidCount} invalid meld(s) - Keep rearranging`);
        elements.rearrangeDoneBtn.disabled = false; // Allow attempt, will show error
    } else {
        updateRearrangeStatus('Drag cards between melds freely');
        elements.rearrangeDoneBtn.disabled = false;
    }
}

// Handle leave game
async function handleLeaveGame() {
    if (confirm('Are you sure you want to leave the game?')) {
        try {
            await socketClient.leaveLobby();
            elements.gameMenuModal.classList.remove('active');
            showScreen('home-screen');
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
}

// Handle play again
async function handlePlayAgain() {
    try {
        // Request server to reset the lobby for a new game
        await socketClient.playAgain();
        // The lobby:reset event will handle showing the waiting room
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Handle back to lobby
async function handleBackToLobby() {
    try {
        await socketClient.leaveLobby();
        showScreen('home-screen');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Export for external use
export function getGameState() {
    return gameState;
}
