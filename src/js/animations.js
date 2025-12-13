// Animation Controller
// Handles all card movement animations for realistic gameplay

import { createCardElement, createCardBackElement } from './cards.js';

// Animation durations (ms)
const DURATIONS = {
    emerge: 200,      // Card pops out of deck
    hover: 300,       // Card hovers enlarged
    flip: 400,        // Card flips to reveal
    travel: 500,      // Card travels to destination
    deal: 250,        // Dealing each card
    discard: 400,     // Discarding
    play: 400         // Playing to table
};

// Get position of an element relative to the viewport
function getElementCenter(element) {
    if (!element) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

// Create a flying card element (card back by default)
function createFlyingCardElement(card = null, showFace = false) {
    let flyingCard;
    
    if (showFace && card) {
        flyingCard = createCardElement(card, { selectable: false });
    } else {
        flyingCard = createCardBackElement();
    }
    
    flyingCard.classList.add('flying-card');
    
    // Override default card transitions for flying animation
    flyingCard.style.transition = 'none';
    
    return flyingCard;
}

// Animate a card with multiple phases
function animateCardMovement(options) {
    const {
        card = null,
        startEl,
        endEl,
        startPos = null,
        endPos = null,
        showFaceAtStart = false,
        flipToReveal = false,
        revealedCard = null,
        onComplete = null,
        phases = ['emerge', 'travel'], // Default phases
        customDurations = {} // Override default durations
    } = options;

    const start = startPos || getElementCenter(startEl);
    const end = endPos || getElementCenter(endEl);
    
    // Merge custom durations with defaults
    const durations = { ...DURATIONS, ...customDurations };
    
    console.log('Creating flying card from', start, 'to', end);
    
    // Create the flying card (starts as back unless showFaceAtStart)
    const flyingCard = createFlyingCardElement(
        showFaceAtStart ? card : null, 
        showFaceAtStart
    );
    
    // Initial position and style - start visible but small
    flyingCard.style.position = 'fixed';
    flyingCard.style.left = `${start.x}px`;
    flyingCard.style.top = `${start.y}px`;
    flyingCard.style.transform = 'translate(-50%, -50%) scale(0.5)';
    flyingCard.style.opacity = '0';
    flyingCard.style.zIndex = '10000';
    flyingCard.style.pointerEvents = 'none';
    
    document.body.appendChild(flyingCard);
    
    // Force reflow to ensure initial styles are applied
    flyingCard.offsetHeight;
    
    let totalTime = 0;
    
    // Phase 1: Emerge (pop up from source)
    if (phases.includes('emerge')) {
        // Use setTimeout to ensure the initial state is rendered first
        setTimeout(() => {
            flyingCard.style.transition = `all ${durations.emerge}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
            flyingCard.style.transform = 'translate(-50%, -50%) scale(1.5) translateY(-50px)';
            flyingCard.style.opacity = '1';
        }, 10);
        totalTime += durations.emerge + 10;
    } else {
        // Just appear
        setTimeout(() => {
            flyingCard.style.opacity = '1';
            flyingCard.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 10);
        totalTime += 10;
    }
    
    // Phase 2: Hover (stay enlarged briefly)
    if (phases.includes('hover')) {
        setTimeout(() => {
            flyingCard.style.transition = `all ${durations.hover}ms ease`;
            flyingCard.style.transform = 'translate(-50%, -50%) scale(1.6) translateY(-60px)';
        }, totalTime);
        totalTime += durations.hover;
    }
    
    // Phase 3: Flip to reveal (if applicable)
    if (flipToReveal && revealedCard) {
        setTimeout(() => {
            // Start flip animation
            flyingCard.style.transition = `transform ${durations.flip / 2}ms ease-in`;
            flyingCard.style.transform = 'translate(-50%, -50%) scale(1.6) translateY(-60px) rotateY(90deg)';
            
            // At halfway point, swap the card content
            setTimeout(() => {
                // Replace with face-up card
                const faceCard = createCardElement(revealedCard, { selectable: false });
                flyingCard.innerHTML = faceCard.innerHTML;
                flyingCard.className = faceCard.className + ' flying-card';
                
                // Complete the flip
                flyingCard.style.transition = `transform ${durations.flip / 2}ms ease-out`;
                flyingCard.style.transform = 'translate(-50%, -50%) scale(1.6) translateY(-60px) rotateY(0deg)';
            }, durations.flip / 2);
        }, totalTime);
        totalTime += durations.flip;
    }
    
    // Phase 4: Travel to destination
    if (phases.includes('travel')) {
        setTimeout(() => {
            flyingCard.style.transition = `all ${durations.travel}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            flyingCard.style.left = `${end.x}px`;
            flyingCard.style.top = `${end.y}px`;
            flyingCard.style.transform = 'translate(-50%, -50%) scale(1)';
        }, totalTime);
        totalTime += durations.travel;
    }
    
    // Fade out and remove
    setTimeout(() => {
        flyingCard.style.transition = 'opacity 150ms ease';
        flyingCard.style.opacity = '0';
        setTimeout(() => {
            flyingCard.remove();
            onComplete?.();
        }, 150);
    }, totalTime);
    
    return totalTime + 150;
}

// Get player area element and position
function getPlayerPosition(playerName) {
    const playerEls = document.querySelectorAll('.table-player');
    let targetEl = null;
    
    playerEls.forEach(el => {
        const nameEl = el.querySelector('.player-name');
        if (nameEl && nameEl.textContent === playerName) {
            targetEl = el;
        }
    });
    
    if (targetEl) {
        return getElementCenter(targetEl);
    }
    
    // Fallback to top center
    return { x: window.innerWidth / 2, y: 150 };
}

// =====================================
// PUBLIC ANIMATION FUNCTIONS
// =====================================

// Animate dealing cards at game start
export function animateDeal(gameState, onComplete) {
    const deckEl = document.getElementById('deck-pile');
    const handEl = document.getElementById('player-hand');
    
    if (!deckEl) {
        onComplete?.();
        return;
    }
    
    const deckPos = getElementCenter(deckEl);
    const handPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    
    const cards = gameState.myHand || [];
    const otherPlayers = (gameState.otherPlayers || []).filter(p => !p.isMe);
    const totalPlayers = otherPlayers.length + 1; // Include self
    
    // Shuffle animation on deck first
    deckEl.classList.add('shuffling');
    setTimeout(() => deckEl.classList.remove('shuffling'), 800);
    
    // Dealing timing - slower and more realistic
    const DEAL_CARD_DELAY = 180; // Time between each card dealt
    const DEAL_DURATION = 350;   // How long each card takes to travel
    
    let currentDelay = 900; // Start after shuffle animation
    
    // Calculate positions for each player including self
    // Self is always last in dealing order for each round
    const playerPositions = [];
    
    // Add other players first
    otherPlayers.forEach((player, idx) => {
        playerPositions.push({
            name: player.name,
            pos: getPlayerPosition(player.name),
            isMe: false
        });
    });
    
    // Add self last
    playerPositions.push({
        name: 'You',
        pos: handPos,
        isMe: true
    });
    
    // Deal 10 rounds, one card to each player per round
    const totalRounds = 10;
    let myCardIndex = 0;
    
    for (let round = 0; round < totalRounds; round++) {
        for (let playerIdx = 0; playerIdx < playerPositions.length; playerIdx++) {
            const player = playerPositions[playerIdx];
            const thisDelay = currentDelay;
            
            if (player.isMe) {
                // Deal to self - show the card flipping
                const card = cards[myCardIndex];
                setTimeout(() => {
                    // Deck bounce effect
                    deckEl.classList.add('dealing-bounce');
                    setTimeout(() => deckEl.classList.remove('dealing-bounce'), 150);
                    
                    animateCardMovement({
                        card,
                        startPos: deckPos,
                        endPos: { x: player.pos.x + (myCardIndex - 5) * 20, y: player.pos.y },
                        showFaceAtStart: false,
                        flipToReveal: true,
                        revealedCard: card,
                        phases: ['emerge', 'travel'],
                        customDurations: { emerge: 150, travel: DEAL_DURATION }
                    });
                }, thisDelay);
                myCardIndex++;
            } else {
                // Deal to other player - just card back
                setTimeout(() => {
                    // Deck bounce effect
                    deckEl.classList.add('dealing-bounce');
                    setTimeout(() => deckEl.classList.remove('dealing-bounce'), 150);
                    
                    animateCardMovement({
                        startPos: deckPos,
                        endPos: player.pos,
                        showFaceAtStart: false,
                        phases: ['emerge', 'travel'],
                        customDurations: { emerge: 150, travel: DEAL_DURATION }
                    });
                }, thisDelay);
            }
            
            currentDelay += DEAL_CARD_DELAY;
        }
    }
    
    // Complete after all animations plus travel time
    const totalDealTime = currentDelay + DEAL_DURATION + 300;
    setTimeout(() => {
        onComplete?.();
    }, totalDealTime);
}

// Animate drawing a card
export function animateDraw(action, myPlayerId) {
    const isMe = action.playerId === myPlayerId;
    const deckEl = document.getElementById('deck-pile');
    const discardEl = document.getElementById('discard-pile');
    const handEl = document.getElementById('player-hand');
    
    const sourceEl = action.source === 'deck' ? deckEl : discardEl;
    if (!sourceEl) return;
    
    const startPos = getElementCenter(sourceEl);
    let endPos;
    
    if (isMe) {
        endPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    } else {
        endPos = getPlayerPosition(action.playerName);
    }
    
    // Determine what to show
    const isFromDiscard = action.source === 'discard';
    const cardToShow = isFromDiscard ? action.cardForDiscard : (isMe ? action.card : null);
    
    if (isMe) {
        // For me: emerge, hover, flip (if from deck), travel
        animateCardMovement({
            card: cardToShow,
            startPos,
            endPos,
            showFaceAtStart: isFromDiscard,
            flipToReveal: !isFromDiscard && action.card,
            revealedCard: action.card,
            phases: ['emerge', 'hover', 'travel']
        });
    } else {
        // For others: they see the card emerge, but it stays as back (unless from discard)
        animateCardMovement({
            card: isFromDiscard ? action.cardForDiscard : null,
            startPos,
            endPos,
            showFaceAtStart: isFromDiscard,
            flipToReveal: false,
            phases: ['emerge', 'hover', 'travel']
        });
    }
    
    // Visual feedback on source
    sourceEl.classList.add('drawing');
    setTimeout(() => sourceEl.classList.remove('drawing'), 300);
}

// Animate playing cards to a meld
export function animatePlayMeld(action, myPlayerId) {
    const isMe = action.playerId === myPlayerId;
    const meldsEl = document.getElementById('melds-container');
    
    if (!meldsEl) return;
    
    const endPos = getElementCenter(meldsEl);
    let startPos;
    
    if (isMe) {
        const handEl = document.getElementById('player-hand');
        startPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    } else {
        startPos = getPlayerPosition(action.playerName);
    }
    
    // Animate each card with stagger
    const cards = action.cards || [];
    cards.forEach((card, index) => {
        setTimeout(() => {
            animateCardMovement({
                card,
                startPos,
                endPos: { x: endPos.x + (index - cards.length / 2) * 40, y: endPos.y },
                showFaceAtStart: true, // Cards played to table are visible
                phases: ['emerge', 'travel']
            });
        }, index * 100);
    });
}

// Animate adding a card to an existing meld
export function animateAddToMeld(action, myPlayerId) {
    const isMe = action.playerId === myPlayerId;
    const meldEl = document.querySelector(`[data-meld-id="${action.meldId}"]`);
    const meldsEl = document.getElementById('melds-container');
    
    const endPos = meldEl ? getElementCenter(meldEl) : getElementCenter(meldsEl);
    let startPos;
    
    if (isMe) {
        const handEl = document.getElementById('player-hand');
        startPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    } else {
        startPos = getPlayerPosition(action.playerName);
    }
    
    animateCardMovement({
        card: action.card,
        startPos,
        endPos,
        showFaceAtStart: true,
        phases: ['emerge', 'travel']
    });
    
    // Pulse the target meld
    if (meldEl) {
        meldEl.classList.add('pulse');
        setTimeout(() => meldEl.classList.remove('pulse'), 500);
    }
}

// Animate discarding a card
export function animateDiscard(action, myPlayerId) {
    const isMe = action.playerId === myPlayerId;
    const discardEl = document.getElementById('discard-pile');
    
    if (!discardEl) return;
    
    const endPos = getElementCenter(discardEl);
    let startPos;
    
    if (isMe) {
        const handEl = document.getElementById('player-hand');
        startPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
    } else {
        startPos = getPlayerPosition(action.playerName);
    }
    
    // Card is always visible when discarding
    animateCardMovement({
        card: action.card,
        startPos,
        endPos,
        showFaceAtStart: true,
        phases: ['emerge', 'travel']
    });
    
    // Pop effect on discard pile when card lands
    setTimeout(() => {
        discardEl.classList.add('receiving');
        setTimeout(() => discardEl.classList.remove('receiving'), 300);
    }, DURATIONS.emerge + DURATIONS.travel - 100);
}

// Animate table rearrangement
export function animateRearrange(action, myPlayerId) {
    const isMe = action.playerId === myPlayerId;
    const meldsEl = document.getElementById('melds-container');
    
    if (!meldsEl) return;
    
    const cardsFromHand = action.cardsFromHand || [];
    
    if (cardsFromHand.length > 0) {
        let startPos;
        
        if (isMe) {
            const handEl = document.getElementById('player-hand');
            startPos = handEl ? getElementCenter(handEl) : { x: window.innerWidth / 2, y: window.innerHeight - 150 };
        } else {
            startPos = getPlayerPosition(action.playerName);
        }
        
        const endPos = getElementCenter(meldsEl);
        
        cardsFromHand.forEach((card, index) => {
            setTimeout(() => {
                animateCardMovement({
                    card,
                    startPos,
                    endPos: { x: endPos.x + (index - cardsFromHand.length / 2) * 40, y: endPos.y },
                    showFaceAtStart: true,
                    phases: ['emerge', 'travel']
                });
            }, index * 80);
        });
    }
    
    // Shimmer effect on melds area
    meldsEl.classList.add('rearranging');
    setTimeout(() => meldsEl.classList.remove('rearranging'), 800);
}

// Handle game action event
export function handleGameAction(action, myPlayerId) {
    console.log('Animation action:', action.type, action);
    
    switch (action.type) {
        case 'draw':
            animateDraw(action, myPlayerId);
            break;
        case 'playMeld':
            animatePlayMeld(action, myPlayerId);
            break;
        case 'addToMeld':
            animateAddToMeld(action, myPlayerId);
            break;
        case 'discard':
            animateDiscard(action, myPlayerId);
            break;
        case 'rearrange':
            animateRearrange(action, myPlayerId);
            break;
    }
}
