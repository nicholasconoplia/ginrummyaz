// Game Manager - Manages active game state and turns
// Handles game flow, player actions, and state synchronization

import { shuffle, createMultipleDecks, dealCards } from './deck.js';
import { isValidMeld, validateRearrangement, checkWin, calculateHandPoints } from './gameEngine.js';

class GameManager {
    constructor(io) {
        this.io = io;
        this.games = new Map(); // lobbyCode -> gameState
    }

    // Initialize a new game for a lobby
    initGame(lobbyCode, players, settings, firstPlayerIndex = 0) {
        const numDecks = settings.numDecks || 1;
        const deck = shuffle(createMultipleDecks(numDecks));
        const { hands, deck: remainingDeck, discardPile } = dealCards(deck, players.length, 10);

        // Ensure firstPlayerIndex is within bounds
        const validFirstPlayer = Math.max(0, Math.min(firstPlayerIndex, players.length - 1));

        const gameState = {
            lobbyCode,
            players: players.map((player, index) => ({
                id: player.id,
                name: player.name,
                hand: hands[index],
                connected: true,
                isTestPlayer: player.isTestPlayer || false
            })),
            deck: remainingDeck,
            discardPile,
            melds: [],
            currentTurn: validFirstPlayer, // Start with the selected first player
            phase: 'draw', // 'draw' | 'play'
            winner: null,
            settings
        };

        this.games.set(lobbyCode, gameState);
        return gameState;
    }

    // Check if current player is a test player (bot)
    isCurrentPlayerBot(lobbyCode) {
        const game = this.games.get(lobbyCode);
        if (!game) return false;
        const currentPlayer = game.players[game.currentTurn];
        return currentPlayer && currentPlayer.isTestPlayer;
    }

    // Find possible melds in a hand
    findPossibleMelds(hand) {
        const melds = [];

        // Group cards by suit for runs
        const bySuit = {};
        hand.forEach(card => {
            if (!bySuit[card.suit]) bySuit[card.suit] = [];
            bySuit[card.suit].push(card);
        });

        // Check for runs in each suit
        for (const suit of Object.keys(bySuit)) {
            const cards = bySuit[suit].sort((a, b) => a.value - b.value);
            if (cards.length >= 3) {
                // Find consecutive sequences
                let run = [cards[0]];
                for (let i = 1; i < cards.length; i++) {
                    if (cards[i].value === run[run.length - 1].value + 1) {
                        run.push(cards[i]);
                    } else if (cards[i].value !== run[run.length - 1].value) {
                        if (run.length >= 3) melds.push([...run]);
                        run = [cards[i]];
                    }
                }
                if (run.length >= 3) melds.push(run);
            }
        }

        // Group cards by rank for sets
        const byRank = {};
        hand.forEach(card => {
            if (!byRank[card.rank]) byRank[card.rank] = [];
            byRank[card.rank].push(card);
        });

        // Check for sets
        for (const rank of Object.keys(byRank)) {
            if (byRank[rank].length >= 3) {
                melds.push(byRank[rank].slice(0, Math.min(4, byRank[rank].length)));
            }
        }

        return melds;
    }

    // Auto-play for bot players
    playBotTurn(lobbyCode) {
        const game = this.games.get(lobbyCode);
        if (!game || game.winner) return null;

        const currentPlayer = game.players[game.currentTurn];
        if (!currentPlayer.isTestPlayer) return null;

        // Bot draws from deck
        if (game.phase === 'draw') {
            if (game.deck.length === 0) {
                if (game.discardPile.length <= 1) {
                    // No cards left anywhere - shouldn't happen
                    return { success: false, error: 'No cards left' };
                }
                const topCard = game.discardPile.pop();
                game.deck = shuffle(game.discardPile);
                game.discardPile = [topCard];
            }
            const drawnCard = game.deck.shift();
            currentPlayer.hand.push(drawnCard);
            game.phase = 'play';
        }

        // Bot tries to play melds
        if (game.phase === 'play') {
            // Find and play any valid melds
            const possibleMelds = this.findPossibleMelds(currentPlayer.hand);
            for (const meldCards of possibleMelds) {
                // Ensure playing this meld leaves at least 1 card
                if (currentPlayer.hand.length - meldCards.length === 0) {
                    continue; // Skip this meld if it leaves no cards
                }

                // Verify the meld is valid
                if (isValidMeld(meldCards)) {
                    // Remove cards from hand
                    for (const card of meldCards) {
                        const idx = currentPlayer.hand.findIndex(c => c.id === card.id);
                        if (idx !== -1) currentPlayer.hand.splice(idx, 1);
                    }

                    // Add meld to table
                    game.melds.push({
                        cards: meldCards,
                        playerId: currentPlayer.id,
                        id: `meld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    });
                }
            }

            // Check for win before discarding
            if (checkWin(currentPlayer.hand)) {
                game.winner = {
                    playerId: currentPlayer.id,
                    playerName: currentPlayer.name,
                    scores: game.players.map(p => ({
                        name: p.name,
                        points: calculateHandPoints(p.hand),
                        isWinner: p.id === currentPlayer.id
                    }))
                };
                return { winner: game.winner };
            }

            // Bot discards a random card (prefer high value cards)
            if (currentPlayer.hand.length > 0) {
                // Sort by value descending and discard highest
                const sorted = [...currentPlayer.hand].sort((a, b) => b.value - a.value);
                const discardCard = sorted[0];
                const discardIndex = currentPlayer.hand.findIndex(c => c.id === discardCard.id);
                const [discardedCard] = currentPlayer.hand.splice(discardIndex, 1);
                game.discardPile.push(discardedCard);

                // Check for win after discard
                if (checkWin(currentPlayer.hand)) {
                    game.winner = {
                        playerId: currentPlayer.id,
                        playerName: currentPlayer.name,
                        scores: game.players.map(p => ({
                            name: p.name,
                            points: calculateHandPoints(p.hand),
                            isWinner: p.id === currentPlayer.id
                        }))
                    };
                    return { winner: game.winner };
                }
            }

            // Next turn
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
            game.phase = 'draw';
        }

        return { success: true };
    }

    // Get game state for a specific player (hide other hands)
    getPlayerView(lobbyCode, playerId) {
        const game = this.games.get(lobbyCode);
        if (!game) return null;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return null;

        return {
            myHand: game.players[playerIndex].hand,
            myIndex: playerIndex,
            otherPlayers: game.players.map((p, i) => ({
                name: p.name,
                cardCount: p.hand.length,
                isMe: i === playerIndex,
                connected: p.connected
            })),
            melds: game.melds,
            discardTop: game.discardPile[game.discardPile.length - 1],
            discardCount: game.discardPile.length,
            deckCount: game.deck.length,
            currentTurn: game.currentTurn,
            currentPlayerName: game.players[game.currentTurn].name,
            isMyTurn: game.currentTurn === playerIndex,
            phase: game.phase,
            winner: game.winner,
            settings: game.settings // Include settings for deck style
        };
    }

    // Draw a card from deck or discard pile
    drawCard(lobbyCode, playerId, source) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return { success: false, error: 'Player not found' };
        if (game.currentTurn !== playerIndex) return { success: false, error: 'Not your turn' };
        if (game.phase !== 'draw') return { success: false, error: 'Already drew a card this turn' };

        let drawnCard;
        if (source === 'deck') {
            if (game.deck.length === 0) {
                // Reshuffle discard pile (except top card) into deck
                const topCard = game.discardPile.pop();
                game.deck = shuffle(game.discardPile);
                game.discardPile = [topCard];
            }
            drawnCard = game.deck.shift();
        } else if (source === 'discard') {
            if (game.discardPile.length === 0) {
                return { success: false, error: 'Discard pile is empty' };
            }
            drawnCard = game.discardPile.pop();
        } else {
            return { success: false, error: 'Invalid source' };
        }

        game.players[playerIndex].hand.push(drawnCard);
        game.phase = 'play';

        return { success: true, card: drawnCard };
    }

    // Play a meld (run or set) from hand
    playMeld(lobbyCode, playerId, cardIds) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return { success: false, error: 'Player not found' };
        if (game.currentTurn !== playerIndex) return { success: false, error: 'Not your turn' };
        if (game.phase !== 'play') return { success: false, error: 'Draw a card first' };

        const player = game.players[playerIndex];
        const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);

        if (cards.length !== cardIds.length) {
            return { success: false, error: 'Some cards not found in hand' };
        }

        if (!isValidMeld(cards)) {
            return { success: false, error: 'Invalid meld. Must be 3+ consecutive same suit or 3+ same rank' };
        }

        // Check if player would have cards left
        if (player.hand.length - cards.length === 0) {
            return { success: false, error: 'You cannot play all your cards. You must keep one card to discard to win.' };
        }

        // Remove cards from hand
        for (const card of cards) {
            const idx = player.hand.findIndex(c => c.id === card.id);
            if (idx !== -1) player.hand.splice(idx, 1);
        }

        // Add meld to table
        game.melds.push({
            cards,
            playerId,
            id: `meld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        return { success: true };
    }

    // Add a card to an existing meld
    addToMeld(lobbyCode, playerId, cardId, meldId, position) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return { success: false, error: 'Player not found' };
        if (game.currentTurn !== playerIndex) return { success: false, error: 'Not your turn' };
        if (game.phase !== 'play') return { success: false, error: 'Draw a card first' };

        const player = game.players[playerIndex];
        const card = player.hand.find(c => c.id === cardId);
        if (!card) return { success: false, error: 'Card not found in hand' };

        const meld = game.melds.find(m => m.id === meldId);
        if (!meld) return { success: false, error: 'Meld not found' };

        // Try adding the card
        const newCards = position === 'start'
            ? [card, ...meld.cards]
            : [...meld.cards, card];

        if (!isValidMeld(newCards)) {
            return { success: false, error: 'Adding this card would create an invalid meld' };
        }

        // Check if player would have cards left
        if (player.hand.length - 1 === 0) {
            return { success: false, error: 'You cannot play your last card. You must discard to win.' };
        }

        // Remove from hand and add to meld
        const idx = player.hand.findIndex(c => c.id === cardId);
        player.hand.splice(idx, 1);
        meld.cards = newCards;

        return { success: true };
    }

    // Rearrange cards on the table (complex moves)
    rearrangeTable(lobbyCode, playerId, proposedMelds, cardsFromHand) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return { success: false, error: 'Player not found' };
        if (game.currentTurn !== playerIndex) return { success: false, error: 'Not your turn' };
        if (game.phase !== 'play') return { success: false, error: 'Draw a card first' };

        const player = game.players[playerIndex];

        // Validate the rearrangement
        const validation = validateRearrangement(game.melds, proposedMelds, player.hand);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Check if player would have cards left
        if (player.hand.length - cardsFromHand.length === 0) {
            return { success: false, error: 'You cannot play all your cards. You must keep one card to discard to win.' };
        }

        // Remove used cards from hand
        for (const cardId of cardsFromHand) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx !== -1) player.hand.splice(idx, 1);
        }

        // Update melds
        game.melds = proposedMelds.filter(m => m.cards.length > 0);

        return { success: true };
    }

    // Discard a card and end turn
    discard(lobbyCode, playerId, cardId) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return { success: false, error: 'Player not found' };
        if (game.currentTurn !== playerIndex) return { success: false, error: 'Not your turn' };
        if (game.phase !== 'play') return { success: false, error: 'Draw a card first' };

        const player = game.players[playerIndex];
        const cardIdx = player.hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return { success: false, error: 'Card not found in hand' };

        // Remove card and add to discard
        const [card] = player.hand.splice(cardIdx, 1);
        game.discardPile.push(card);

        // Check for win
        if (checkWin(player.hand)) {
            game.winner = {
                playerId,
                playerName: player.name,
                scores: game.players.map(p => ({
                    name: p.name,
                    points: calculateHandPoints(p.hand),
                    isWinner: p.id === playerId
                }))
            };
            return { success: true, winner: game.winner };
        }

        // Next turn
        game.currentTurn = (game.currentTurn + 1) % game.players.length;
        game.phase = 'draw';

        return { success: true };
    }

    // End turn without discarding (for going out directly)
    endTurn(lobbyCode, playerId) {
        const game = this.games.get(lobbyCode);
        if (!game) return { success: false, error: 'Game not found' };

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const player = game.players[playerIndex];

        // Check for win (must have no cards)
        if (checkWin(player.hand)) {
            game.winner = {
                playerId,
                playerName: player.name,
                scores: game.players.map(p => ({
                    name: p.name,
                    points: calculateHandPoints(p.hand),
                    isWinner: p.id === playerId
                }))
            };
            return { success: true, winner: game.winner };
        }

        return { success: false, error: 'You must discard a card or go out with no cards' };
    }

    // Handle player disconnect
    playerDisconnected(lobbyCode, playerId) {
        const game = this.games.get(lobbyCode);
        if (!game) return;

        const player = game.players.find(p => p.id === playerId);
        if (player) {
            player.connected = false;
        }
    }

    // Handle player reconnect
    playerReconnected(lobbyCode, playerId, newSocketId) {
        const game = this.games.get(lobbyCode);
        if (!game) return false;

        const player = game.players.find(p => p.id === playerId);
        if (player) {
            player.connected = true;
            player.id = newSocketId;
            return true;
        }
        return false;
    }

    // Get full game state (for debugging/admin)
    getFullState(lobbyCode) {
        return this.games.get(lobbyCode);
    }

    // Remove game
    removeGame(lobbyCode) {
        this.games.delete(lobbyCode);
    }
}

export default GameManager;
