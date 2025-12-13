// Game Engine - Core game rules and validation
// Handles meld validation, table rearrangement, and win conditions

import { getRankValue } from './deck.js';

// Check if cards form a valid run (3+ consecutive cards of same suit)
export function isValidRun(cards) {
    if (cards.length < 3) return false;

    // All cards must be same suit
    const suit = cards[0].suit;
    if (!cards.every(card => card.suit === suit)) return false;

    // Sort by value (Ace = 1, J = 11, Q = 12, K = 13)
    const sorted = [...cards].sort((a, b) => a.value - b.value);

    // Check if it's a regular consecutive run
    function isConsecutive(sortedCards) {
        for (let i = 1; i < sortedCards.length; i++) {
            if (sortedCards[i].value !== sortedCards[i - 1].value + 1) {
                return false;
            }
        }
        return true;
    }

    // First try: normal run (Ace low: A-2-3, or other consecutive)
    if (isConsecutive(sorted)) {
        return true;
    }

    // Second try: Ace-high run (Q-K-A where A counts as 14)
    // Check if we have an Ace and the rest are at the high end (Q, K, etc.)
    const hasAce = sorted.some(c => c.rank === 'A');
    if (hasAce) {
        // Re-sort with Ace = 14
        const sortedAceHigh = [...cards].sort((a, b) => {
            const valA = a.rank === 'A' ? 14 : a.value;
            const valB = b.rank === 'A' ? 14 : b.value;
            return valA - valB;
        });

        // Check if consecutive with Ace as 14
        let isAceHighConsecutive = true;
        for (let i = 1; i < sortedAceHigh.length; i++) {
            const prevVal = sortedAceHigh[i - 1].rank === 'A' ? 14 : sortedAceHigh[i - 1].value;
            const currVal = sortedAceHigh[i].rank === 'A' ? 14 : sortedAceHigh[i].value;
            if (currVal !== prevVal + 1) {
                isAceHighConsecutive = false;
                break;
            }
        }
        if (isAceHighConsecutive) {
            return true;
        }
    }

    return false;
}

// Check if cards form a valid set (3+ cards of same rank)
export function isValidSet(cards) {
    if (cards.length < 3) return false;

    const rank = cards[0].rank;
    return cards.every(card => card.rank === rank);
}

// Check if cards form either a valid run or set
export function isValidMeld(cards) {
    return isValidRun(cards) || isValidSet(cards);
}

// Check if a card can be added to an existing meld
export function canAddToMeld(meld, card) {
    const newMeld = [...meld, card];
    return isValidMeld(newMeld);
}

// Validate that all melds on the table are still valid after rearrangement
export function validateTableState(melds) {
    for (const meld of melds) {
        if (meld.cards.length > 0 && !isValidMeld(meld.cards)) {
            return false;
        }
    }
    return true;
}

// Find where a card can be added to existing melds
export function findPossibleAdditions(card, melds) {
    const possibilities = [];

    for (let i = 0; i < melds.length; i++) {
        // Try adding at the beginning
        if (isValidMeld([card, ...melds[i].cards])) {
            possibilities.push({ meldIndex: i, position: 'start' });
        }
        // Try adding at the end
        if (isValidMeld([...melds[i].cards, card])) {
            possibilities.push({ meldIndex: i, position: 'end' });
        }
    }

    return possibilities;
}

// Validate a proposed table rearrangement
// Takes the current melds and proposed new arrangement
// Returns { valid: boolean, error?: string }
export function validateRearrangement(currentMelds, proposedMelds, playerHand = []) {
    // Get all cards currently on table
    const currentTableCards = currentMelds.flatMap(m => m.cards);
    const proposedTableCards = proposedMelds.flatMap(m => m.cards);

    // Get all card IDs for comparison
    const currentIds = new Set(currentTableCards.map(c => c.id));
    const proposedIds = new Set(proposedTableCards.map(c => c.id));

    // Cards can be added from hand, but not removed to hand
    const handIds = new Set(playerHand.map(c => c.id));

    // Check if any cards from table are missing (not allowed)
    for (const id of currentIds) {
        if (!proposedIds.has(id)) {
            return { valid: false, error: 'Cannot remove cards from the table back to hand' };
        }
    }

    // Check that any new cards are from the player's hand
    for (const id of proposedIds) {
        if (!currentIds.has(id) && !handIds.has(id)) {
            return { valid: false, error: 'New cards must come from your hand' };
        }
    }

    // Validate all proposed melds
    for (let i = 0; i < proposedMelds.length; i++) {
        const meld = proposedMelds[i];
        if (meld.cards.length > 0 && !isValidMeld(meld.cards)) {
            return {
                valid: false,
                error: `Meld ${i + 1} is not valid. Each meld must be a run (3+ consecutive same suit) or set (3+ same rank).`
            };
        }
    }

    // Remove empty melds
    const validMelds = proposedMelds.filter(m => m.cards.length > 0);

    // Check minimum size
    for (const meld of validMelds) {
        if (meld.cards.length < 3) {
            return { valid: false, error: 'Each meld must have at least 3 cards' };
        }
    }

    return { valid: true };
}

// Check if a player has won (no cards left)
export function checkWin(playerHand) {
    return playerHand.length === 0;
}

// Calculate the point value of remaining cards in hand (for scoring)
export function calculateHandPoints(hand) {
    return hand.reduce((sum, card) => {
        if (card.rank === 'A') return sum + 1;
        if (['J', 'Q', 'K'].includes(card.rank)) return sum + 10;
        return sum + card.value;
    }, 0);
}
