// Card rendering and interaction utilities
// Handles card creation, display, and suit symbols

// Suit symbols
const SUIT_SYMBOLS = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

// Suit colors
const SUIT_COLORS = {
    hearts: 'hearts',
    diamonds: 'diamonds',
    clubs: 'clubs',
    spades: 'spades'
};

// Suit to letter mapping for custom card file names
const SUIT_LETTERS = {
    hearts: 'H',
    diamonds: 'D',
    clubs: 'C',
    spades: 'S'
};

// Current deck style (set by game module)
let currentDeckStyle = 'default';

// Create a card element
export function createCardElement(card, options = {}) {
    const {
        selectable = true,
        showBack = false,
        animationDelay = 0,
        dealAnimation = false
    } = options;

    const cardEl = document.createElement('div');
    cardEl.className = `card ${SUIT_COLORS[card.suit]}`;
    cardEl.dataset.cardId = card.id;
    cardEl.dataset.rank = card.rank;
    cardEl.dataset.suit = card.suit;
    cardEl.dataset.value = card.value;

    if (dealAnimation) {
        cardEl.classList.add('dealing');
        cardEl.style.setProperty('--deal-delay', `${animationDelay}ms`);
    }

    if (showBack) {
        cardEl.classList.add('card-back');
        cardEl.innerHTML = '<div class="card-back-pattern"></div>';
        return cardEl;
    }

    // Check for custom image (try localStorage or card property)
    const customImage = getCustomCardImage(card);

    if (customImage) {
        cardEl.classList.add('has-custom-image');
        // Render image as background to allow face content on top
        const imgEl = document.createElement('div');
        imgEl.className = 'card-bg-image';
        imgEl.style.backgroundImage = `url(${customImage})`;
        cardEl.appendChild(imgEl);
    }

    // Default card face design (always centered suit for non-custom, overlay for custom)
    const faceContent = `
      <div class="card-face">
        <div class="card-corner top-left">
          <span class="card-rank">${card.rank}</span>
          <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
        </div>
        ${!customImage ? `<span class="card-suit-large">${SUIT_SYMBOLS[card.suit]}</span>` : ''}
        <div class="card-corner bottom-right">
          <span class="card-rank">${card.rank}</span>
          <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
        </div>
      </div>
    `;

    // Append face AFTER bg image
    cardEl.insertAdjacentHTML('beforeend', faceContent);

    if (selectable) {
        cardEl.addEventListener('click', () => {
            cardEl.classList.toggle('selected');
            document.dispatchEvent(new CustomEvent('cardSelectionChanged'));
        });
    }

    return cardEl;
}

// Create a card back element
export function createCardBackElement() {
    const cardEl = document.createElement('div');
    cardEl.className = 'card card-back';
    cardEl.innerHTML = '<div class="card-back-pattern"></div>';
    return cardEl;
}

// Create mini card stack for other player display
export function createMiniCardStack(count) {
    const container = document.createElement('div');
    container.className = 'mini-cards-stack';

    // Show max 5 mini cards
    const displayCount = Math.min(count, 5);
    for (let i = 0; i < displayCount; i++) {
        const miniCard = document.createElement('div');
        miniCard.className = 'mini-card';
        container.appendChild(miniCard);
    }

    return container;
}

// Render a meld group (sorts cards in order)
export function createMeldElement(meld) {
    const meldEl = document.createElement('div');
    meldEl.className = 'meld-group';
    meldEl.dataset.meldId = meld.id;

    // Sort the meld cards for display
    // Check if it's a run (same suit) or set (same rank)
    const isRun = meld.cards.length > 0 &&
        meld.cards.every(c => c.suit === meld.cards[0].suit);

    let sortedCards;
    if (isRun) {
        // Sort run by rank value, handling Ace-high (Q-K-A)
        const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        sortedCards = [...meld.cards].sort((a, b) => {
            let valA = rankValues[a.rank];
            let valB = rankValues[b.rank];
            return valA - valB;
        });

        // Check if it's an Ace-high run (Q-K-A) and reorder
        if (sortedCards.length >= 3) {
            const hasAce = sortedCards.some(c => c.rank === 'A');
            const hasKing = sortedCards.some(c => c.rank === 'K');
            const hasQueen = sortedCards.some(c => c.rank === 'Q');
            const hasTwo = sortedCards.some(c => c.rank === '2');

            // If we have A, K, Q but no 2, it's an Ace-high run
            if (hasAce && hasKing && !hasTwo) {
                // Move Ace to the end
                const aceIndex = sortedCards.findIndex(c => c.rank === 'A');
                const ace = sortedCards.splice(aceIndex, 1)[0];
                sortedCards.push(ace);
            }
        }
    } else {
        // For sets, just use original order
        sortedCards = meld.cards;
    }

    sortedCards.forEach(card => {
        const cardEl = createCardElement(card, { selectable: false });
        meldEl.appendChild(cardEl);
    });

    return meldEl;
}

// Sort cards by suit then rank
export function sortCards(cards) {
    const suitOrder = ['hearts', 'diamonds', 'clubs', 'spades'];
    const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    return [...cards].sort((a, b) => {
        const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
        if (suitDiff !== 0) return suitDiff;
        return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });
}

// Get selected cards from hand
export function getSelectedCards() {
    const selected = document.querySelectorAll('.player-hand .card.selected');
    return Array.from(selected).map(el => ({
        id: el.dataset.cardId,
        rank: el.dataset.rank,
        suit: el.dataset.suit,
        value: parseInt(el.dataset.value, 10)
    }));
}

// Clear all selections
export function clearSelection() {
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
    document.dispatchEvent(new CustomEvent('cardSelectionChanged'));
}

// Create discard pile card
export function createDiscardCard(card) {
    if (!card) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'card card-placeholder';
        emptyEl.innerHTML = '<span class="card-placeholder-icon">🃏</span><span>Empty</span>';
        return emptyEl;
    }
    return createCardElement(card, { selectable: false });
}

// Get custom image for a card
function getCustomCardImage(card) {
    // Try to get from card property first
    if (card.image) return card.image;

    // Check if custom deck style is enabled
    if (currentDeckStyle === 'custom') {
        // Build path to custom card image
        // Format: /cards/{RANK}/{RANK}_{SUIT_LETTER}.png
        const rank = card.rank;
        const suitLetter = SUIT_LETTERS[card.suit];
        if (suitLetter) {
            return `/cards/${rank}/${rank}_${suitLetter}.png`;
        }
    }

    // Try localStorage settings (for user-uploaded custom cards)
    try {
        const customCards = JSON.parse(localStorage.getItem('ginrummy_custom_cards') || '{}');
        const key = `${card.rank}_${card.suit}`;
        return customCards[key] || null;
    } catch {
        return null;
    }
}

// Set the current deck style
export function setDeckStyle(style) {
    currentDeckStyle = style;
}

// Get the current deck style
export function getDeckStyle() {
    return currentDeckStyle;
}
