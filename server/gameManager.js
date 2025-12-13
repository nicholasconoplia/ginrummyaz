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

    // Check if a card can be added to an existing meld
    canAddToMeld(card, meld) {
        // Try adding at start
        const withStart = [card, ...meld.cards];
        if (isValidMeld(withStart)) {
            return { position: 'start', valid: true };
        }
        
        // Try adding at end
        const withEnd = [...meld.cards, card];
        if (isValidMeld(withEnd)) {
            return { position: 'end', valid: true };
        }
        
        return { valid: false };
    }

    // Check if the discard card is useful for the bot
    isDiscardCardUseful(discardCard, hand, melds) {
        if (!discardCard) return false;
        
        // Check if it can extend an existing meld
        for (const meld of melds) {
            if (this.canAddToMeld(discardCard, meld).valid) {
                return true;
            }
        }
        
        // Check if it helps form a new meld with hand cards
        const testHand = [...hand, discardCard];
        const possibleMelds = this.findPossibleMelds(testHand);
        const currentMelds = this.findPossibleMelds(hand);
        
        // If adding this card creates more melds, it's useful
        return possibleMelds.length > currentMelds.length;
    }

    // Find the best card to discard (one that's least useful)
    findBestDiscard(hand, melds) {
        if (hand.length === 0) return null;
        
        // Score each card by how useful it is
        const cardScores = hand.map(card => {
            let score = card.value; // Base score is card value (higher = worse to keep)
            
            // Check if card can extend a meld on table
            for (const meld of melds) {
                if (this.canAddToMeld(card, meld).valid) {
                    score -= 20; // Very useful, don't discard
                }
            }
            
            // Check if card is part of a potential meld in hand
            const handWithoutCard = hand.filter(c => c.id !== card.id);
            const meldsWithCard = this.findPossibleMelds(hand);
            const meldsWithoutCard = this.findPossibleMelds(handWithoutCard);
            
            if (meldsWithCard.length > meldsWithoutCard.length) {
                score -= 15; // Part of a meld, don't discard
            }
            
            // Check for partial melds (2 cards that could become 3)
            const sameRank = hand.filter(c => c.rank === card.rank && c.id !== card.id);
            const sameSuit = hand.filter(c => c.suit === card.suit && c.id !== card.id);
            
            if (sameRank.length >= 1) {
                score -= 5; // Potential set
            }
            
            // Check for consecutive cards in same suit
            const consecutive = sameSuit.filter(c => 
                Math.abs(c.value - card.value) === 1
            );
            if (consecutive.length >= 1) {
                score -= 5; // Potential run
            }
            
            return { card, score };
        });
        
        // Sort by score descending (highest score = best to discard)
        cardScores.sort((a, b) => b.score - a.score);
        return cardScores[0].card;
    }

    // ========================================
    // FULL TABLE REARRANGEMENT FOR BOTS
    // ========================================

    // Find all possible runs in a set of cards
    findAllRuns(cards) {
        const runs = [];
        
        // Group by suit
        const bySuit = {};
        cards.forEach(card => {
            if (!bySuit[card.suit]) bySuit[card.suit] = [];
            bySuit[card.suit].push(card);
        });
        
        // Find runs in each suit
        for (const suit of Object.keys(bySuit)) {
            const suitCards = bySuit[suit].sort((a, b) => a.value - b.value);
            
            // Find all possible consecutive sequences of 3+
            for (let start = 0; start < suitCards.length; start++) {
                let run = [suitCards[start]];
                
                for (let i = start + 1; i < suitCards.length; i++) {
                    if (suitCards[i].value === run[run.length - 1].value + 1) {
                        run.push(suitCards[i]);
                        if (run.length >= 3) {
                            runs.push([...run]);
                        }
                    } else if (suitCards[i].value !== run[run.length - 1].value) {
                        break;
                    }
                }
            }
        }
        
        return runs;
    }

    // Find all possible sets in a set of cards
    findAllSets(cards) {
        const sets = [];
        
        // Group by rank
        const byRank = {};
        cards.forEach(card => {
            if (!byRank[card.rank]) byRank[card.rank] = [];
            byRank[card.rank].push(card);
        });
        
        // Find sets of 3 or 4
        for (const rank of Object.keys(byRank)) {
            const rankCards = byRank[rank];
            if (rankCards.length >= 3) {
                // Add set of 3
                sets.push(rankCards.slice(0, 3));
                // Add set of 4 if possible
                if (rankCards.length >= 4) {
                    sets.push(rankCards.slice(0, 4));
                }
            }
        }
        
        return sets;
    }

    // Try to find a valid arrangement of cards into melds
    // Returns { success: boolean, melds: array, unusedCards: array }
    findValidArrangement(cards, requiredCardIds = new Set()) {
        // Find all possible melds
        const allRuns = this.findAllRuns(cards);
        const allSets = this.findAllSets(cards);
        const allMelds = [...allRuns, ...allSets];
        
        if (allMelds.length === 0) {
            return { success: false, melds: [], unusedCards: cards };
        }
        
        // Try to find a combination that uses all required cards
        const bestResult = this.findBestMeldCombination(cards, allMelds, requiredCardIds);
        
        return bestResult;
    }

    // Recursive function to find the best combination of melds
    findBestMeldCombination(availableCards, possibleMelds, requiredCardIds, currentMelds = [], depth = 0) {
        // Limit recursion depth for performance
        if (depth > 10) {
            const usedIds = new Set(currentMelds.flatMap(m => m.map(c => c.id)));
            const unusedCards = availableCards.filter(c => !usedIds.has(c.id));
            const coversRequired = [...requiredCardIds].every(id => usedIds.has(id));
            return {
                success: coversRequired,
                melds: currentMelds,
                unusedCards,
                handCardsUsed: currentMelds.flatMap(m => m).filter(c => !requiredCardIds.has(c.id)).length
            };
        }

        const usedIds = new Set(currentMelds.flatMap(m => m.map(c => c.id)));
        const unusedCards = availableCards.filter(c => !usedIds.has(c.id));
        
        // Check if we've covered all required cards
        const coversRequired = [...requiredCardIds].every(id => usedIds.has(id));
        
        // Filter melds that don't conflict with already used cards
        const validMelds = possibleMelds.filter(meld => 
            meld.every(card => !usedIds.has(card.id))
        );
        
        if (validMelds.length === 0) {
            return {
                success: coversRequired,
                melds: currentMelds,
                unusedCards,
                handCardsUsed: currentMelds.flatMap(m => m).filter(c => !requiredCardIds.has(c.id)).length
            };
        }
        
        // Try adding each possible meld and recurse
        let bestResult = {
            success: coversRequired,
            melds: currentMelds,
            unusedCards,
            handCardsUsed: currentMelds.flatMap(m => m).filter(c => !requiredCardIds.has(c.id)).length
        };
        
        for (const meld of validMelds) {
            const newCurrentMelds = [...currentMelds, meld];
            const result = this.findBestMeldCombination(
                availableCards, 
                possibleMelds, 
                requiredCardIds, 
                newCurrentMelds,
                depth + 1
            );
            
            // Prefer results that: 1) cover required cards, 2) use more hand cards
            if (result.success && (!bestResult.success || result.handCardsUsed > bestResult.handCardsUsed)) {
                bestResult = result;
            } else if (!bestResult.success && result.success) {
                bestResult = result;
            }
        }
        
        return bestResult;
    }

    // Attempt full table rearrangement for bot
    // Returns { success: boolean, newMelds: array, cardsFromHand: array }
    tryBotRearrangement(tableCards, hand, requiredTableCardIds) {
        // Combine table cards with hand cards
        const allCards = [...tableCards, ...hand];
        
        // Try to find an arrangement that uses all table cards plus some hand cards
        const result = this.findValidArrangement(allCards, requiredTableCardIds);
        
        if (!result.success) {
            return { success: false };
        }
        
        // Check that all table cards are used
        const usedIds = new Set(result.melds.flatMap(m => m.map(c => c.id)));
        const allTableCardsUsed = [...requiredTableCardIds].every(id => usedIds.has(id));
        
        if (!allTableCardsUsed) {
            return { success: false };
        }
        
        // Find which hand cards were used
        const handCardIds = new Set(hand.map(c => c.id));
        const cardsFromHand = result.melds.flatMap(m => m).filter(c => handCardIds.has(c.id));
        
        // Only proceed if we're using at least one hand card and have at least one card left
        if (cardsFromHand.length === 0) {
            return { success: false };
        }
        
        const remainingHand = hand.filter(c => !cardsFromHand.some(hc => hc.id === c.id));
        if (remainingHand.length === 0) {
            return { success: false }; // Must keep at least one card to discard
        }
        
        // Convert melds to proper format
        const newMelds = result.melds.map((cards, i) => ({
            id: `meld_bot_${Date.now()}_${i}`,
            cards: cards,
            playerId: 'bot'
        }));
        
        return {
            success: true,
            newMelds,
            cardsFromHand: cardsFromHand.map(c => c.id),
            remainingHand
        };
    }

    // Auto-play for bot players (enhanced AI)
    playBotTurn(lobbyCode) {
        const game = this.games.get(lobbyCode);
        if (!game || game.winner) return null;

        const currentPlayer = game.players[game.currentTurn];
        if (!currentPlayer.isTestPlayer) return null;

        // Bot draws - smart choice between deck and discard
        if (game.phase === 'draw') {
            const discardTop = game.discardPile[game.discardPile.length - 1];
            
            // Check if discard card is useful
            const shouldTakeDiscard = discardTop && 
                this.isDiscardCardUseful(discardTop, currentPlayer.hand, game.melds);
            
            if (shouldTakeDiscard && game.discardPile.length > 0) {
                // Take from discard pile
                const drawnCard = game.discardPile.pop();
                currentPlayer.hand.push(drawnCard);
            } else {
                // Draw from deck
                if (game.deck.length === 0) {
                    if (game.discardPile.length <= 1) {
                        return { success: false, error: 'No cards left' };
                    }
                    const topCard = game.discardPile.pop();
                    game.deck = shuffle(game.discardPile);
                    game.discardPile = [topCard];
                }
                const drawnCard = game.deck.shift();
                currentPlayer.hand.push(drawnCard);
            }
            game.phase = 'play';
        }

        // Bot tries to play melds and add to existing melds
        if (game.phase === 'play') {
            // Strategy 1: Try full table rearrangement if there are melds on table
            if (game.melds.length > 0 && currentPlayer.hand.length > 1) {
                const tableCards = game.melds.flatMap(m => m.cards);
                const requiredTableCardIds = new Set(tableCards.map(c => c.id));
                
                const rearrangeResult = this.tryBotRearrangement(
                    tableCards,
                    currentPlayer.hand,
                    requiredTableCardIds
                );
                
                if (rearrangeResult.success && rearrangeResult.cardsFromHand.length > 0) {
                    // Apply the rearrangement
                    game.melds = rearrangeResult.newMelds;
                    
                    // Remove used cards from hand
                    for (const cardId of rearrangeResult.cardsFromHand) {
                        const idx = currentPlayer.hand.findIndex(c => c.id === cardId);
                        if (idx !== -1) {
                            currentPlayer.hand.splice(idx, 1);
                        }
                    }
                }
            }

            // Strategy 2: Try to add individual cards to existing melds
            let addedToMeld = true;
            while (addedToMeld && currentPlayer.hand.length > 1) {
                addedToMeld = false;
                
                for (const meld of game.melds) {
                    for (let i = 0; i < currentPlayer.hand.length; i++) {
                        const card = currentPlayer.hand[i];
                        const result = this.canAddToMeld(card, meld);
                        
                        if (result.valid && currentPlayer.hand.length > 1) {
                            // Add card to meld
                            if (result.position === 'start') {
                                meld.cards.unshift(card);
                            } else {
                                meld.cards.push(card);
                            }
                            currentPlayer.hand.splice(i, 1);
                            addedToMeld = true;
                            break;
                        }
                    }
                    if (addedToMeld) break;
                }
            }

            // Strategy 3: Play new melds from hand
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

            // Bot discards using smart selection
            if (currentPlayer.hand.length > 0) {
                const discardCard = this.findBestDiscard(currentPlayer.hand, game.melds);
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
    playerDisconnected(lobbyCode, socketId) {
        const game = this.games.get(lobbyCode);
        if (!game) return;

        const player = game.players.find(p => p.id === socketId);
        if (player) {
            player.connected = false;
            console.log(`Player ${player.name} marked as disconnected in game ${lobbyCode}`);
        }
    }

    // Handle player reconnect
    // oldSocketId is optional - if provided, we look for that player
    // persistentId is the odId from the client session
    playerReconnected(lobbyCode, persistentId, newSocketId, oldSocketId = null) {
        const game = this.games.get(lobbyCode);
        if (!game) {
            console.log(`No game found for lobby ${lobbyCode} during reconnection`);
            return false;
        }

        // Try to find player by old socket ID first
        let player = null;
        if (oldSocketId) {
            player = game.players.find(p => p.id === oldSocketId);
        }
        
        // If not found, look for disconnected player by matching with lobby data
        // The player's id in game state might still be the old socket id
        if (!player) {
            // Find disconnected player - this is a fallback
            player = game.players.find(p => !p.connected && !p.isTestPlayer);
        }

        if (player) {
            const oldId = player.id;
            player.connected = true;
            player.id = newSocketId;
            console.log(`Player ${player.name} reconnected in game ${lobbyCode} (${oldId} -> ${newSocketId})`);
            return true;
        }
        
        console.log(`Could not find player to reconnect in game ${lobbyCode}`);
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
