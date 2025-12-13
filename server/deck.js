// Deck management for Gin Rummy
// Handles deck creation, shuffling, and card identification

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Get numeric value for a rank (for run validation)
export function getRankValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    return parseInt(rank);
}

// Create a single deck of 52 cards
export function createDeck(deckIndex = 0) {
    const cards = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            cards.push({
                id: `${deckIndex}_${rank}_${suit}`,
                rank,
                suit,
                value: getRankValue(rank),
                deckIndex
            });
        }
    }
    return cards;
}

// Create multiple decks combined
export function createMultipleDecks(numDecks) {
    let allCards = [];
    for (let i = 0; i < numDecks; i++) {
        allCards = allCards.concat(createDeck(i));
    }
    return allCards;
}

// Fisher-Yates shuffle algorithm
export function shuffle(cards) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Deal cards to players
export function dealCards(deck, numPlayers, cardsPerPlayer = 10) {
    const hands = [];
    const remainingDeck = [...deck];

    for (let i = 0; i < numPlayers; i++) {
        hands.push(remainingDeck.splice(0, cardsPerPlayer));
    }

    // First card goes to discard pile
    const discardPile = [remainingDeck.shift()];

    return {
        hands,
        deck: remainingDeck,
        discardPile
    };
}

