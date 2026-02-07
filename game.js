/**
 * Cockroach Poker - Game Engine
 * แมลงสาบโป๊กเกอร์
 */

// ===== Constants =====
const CREATURES = [
    { id: 'cockroach', name: 'แมลงสาบ', emoji: '🪳' },
    { id: 'scorpion', name: 'แมงป่อง', emoji: '🦂' },
    { id: 'bat', name: 'ค้างคาว', emoji: '🦇' },
    { id: 'rat', name: 'หนู', emoji: '🐀' },
    { id: 'frog', name: 'กบ', emoji: '🐸' },
    { id: 'fly', name: 'แมงวัน', emoji: '🪰' },
    { id: 'spider', name: 'แมงมุม', emoji: '🕷️' },
    { id: 'stinkbug', name: 'แมงทับ', emoji: '🪲' }
];

const CARDS_PER_CREATURE = 8;
const MAX_FACEUP_BEFORE_LOSE = 4;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

// ===== Game State =====
let gameState = {
    players: [],
    currentPlayerIndex: 0,
    deck: [],
    phase: 'setup', // setup, playing, gameover
    pendingCard: null, // { card, fromPlayer, claimedCreature, seenBy: [] }
    receivingPlayerIndex: null,
    log: []
};

// ===== DOM Elements =====
const elements = {
    // Screens
    setupScreen: document.getElementById('setup-screen'),
    gameScreen: document.getElementById('game-screen'),
    
    // Setup
    playerNamesContainer: document.getElementById('player-names-container'),
    startGameBtn: document.getElementById('start-game-btn'),
    
    // Game
    currentTurnDisplay: document.getElementById('current-turn-display'),
    playersArea: document.getElementById('players-area'),
    handOwnerName: document.getElementById('hand-owner-name'),
    handCount: document.getElementById('hand-count'),
    playerHand: document.getElementById('player-hand'),
    gameLog: document.getElementById('game-log'),
    
    // Send Modal
    sendCardModal: document.getElementById('send-card-modal'),
    selectedCardDisplay: document.getElementById('selected-card-display'),
    targetPlayerOptions: document.getElementById('target-player-options'),
    claimAnimalOptions: document.getElementById('claim-animal-options'),
    cancelSendBtn: document.getElementById('cancel-send-btn'),
    confirmSendBtn: document.getElementById('confirm-send-btn'),
    
    // Receive Modal
    receiveCardModal: document.getElementById('receive-card-modal'),
    receiveMessage: document.getElementById('receive-message'),
    claimedAnimalDisplay: document.getElementById('claimed-animal-display'),
    believeBtn: document.getElementById('believe-btn'),
    notBelieveBtn: document.getElementById('not-believe-btn'),
    passBtn: document.getElementById('pass-btn'),
    
    // Pass Modal
    passCardModal: document.getElementById('pass-card-modal'),
    revealedCardDisplay: document.getElementById('revealed-card-display'),
    passTargetOptions: document.getElementById('pass-target-options'),
    passClaimOptions: document.getElementById('pass-claim-options'),
    confirmPassBtn: document.getElementById('confirm-pass-btn'),
    
    // Result Modal
    resultModal: document.getElementById('result-modal'),
    resultTitle: document.getElementById('result-title'),
    resultCardDisplay: document.getElementById('result-card-display'),
    resultMessage: document.getElementById('result-message'),
    resultOutcome: document.getElementById('result-outcome'),
    resultContinueBtn: document.getElementById('result-continue-btn'),
    
    // Game Over Modal
    gameoverModal: document.getElementById('gameover-modal'),
    loserDisplay: document.getElementById('loser-display'),
    gameoverReason: document.getElementById('gameover-reason'),
    playAgainBtn: document.getElementById('play-again-btn'),
    
    // Switch Player Modal
    switchPlayerModal: document.getElementById('switch-player-modal'),
    nextPlayerDisplay: document.getElementById('next-player-display'),
    switchReadyBtn: document.getElementById('switch-ready-btn')
};

// ===== Send Modal State =====
let sendModalState = {
    selectedCard: null,
    targetPlayer: null,
    claimedCreature: null
};

// ===== Pass Modal State =====
let passModalState = {
    targetPlayer: null,
    claimedCreature: null
};

// ===== Initialization =====
function init() {
    setupEventListeners();
    generatePlayerNameInputs(6); // Default 6 players
}

function setupEventListeners() {
    // Player count selector
    document.querySelectorAll('.count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generatePlayerNameInputs(parseInt(btn.dataset.count));
        });
    });
    
    // Start game
    elements.startGameBtn.addEventListener('click', startGame);
    
    // Send modal
    elements.cancelSendBtn.addEventListener('click', closeSendModal);
    elements.confirmSendBtn.addEventListener('click', confirmSendCard);
    
    // Receive modal
    elements.believeBtn.addEventListener('click', () => handleGuess(true));
    elements.notBelieveBtn.addEventListener('click', () => handleGuess(false));
    elements.passBtn.addEventListener('click', handlePassChoice);
    
    // Pass modal
    elements.confirmPassBtn.addEventListener('click', confirmPassCard);
    
    // Result modal
    elements.resultContinueBtn.addEventListener('click', continueAfterResult);
    
    // Game over
    elements.playAgainBtn.addEventListener('click', resetGame);
    
    // Switch player
    elements.switchReadyBtn.addEventListener('click', closeSwitchModal);
}

function generatePlayerNameInputs(count) {
    elements.playerNamesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `ผู้เล่น ${i + 1}`;
        input.dataset.playerIndex = i;
        input.value = `ผู้เล่น ${i + 1}`;
        elements.playerNamesContainer.appendChild(input);
    }
}

// ===== Game Setup =====
function createDeck() {
    const deck = [];
    CREATURES.forEach(creature => {
        for (let i = 0; i < CARDS_PER_CREATURE; i++) {
            deck.push({ ...creature, uid: `${creature.id}-${i}` });
        }
    });
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function startGame() {
    const inputs = elements.playerNamesContainer.querySelectorAll('input');
    const playerCount = inputs.length;
    
    // Create players
    gameState.players = [];
    inputs.forEach((input, index) => {
        gameState.players.push({
            id: index,
            name: input.value.trim() || `ผู้เล่น ${index + 1}`,
            hand: [],
            faceUpCards: []
        });
    });
    
    // Create and deal deck
    gameState.deck = createDeck();
    dealCards();
    
    // Set game state
    gameState.currentPlayerIndex = 0;
    gameState.phase = 'playing';
    gameState.pendingCard = null;
    gameState.receivingPlayerIndex = null;
    gameState.log = [];
    
    // Switch to game screen
    elements.setupScreen.classList.remove('active');
    elements.gameScreen.classList.add('active');
    
    // Render initial state
    renderGame();
    addLog(`เกมเริ่มต้น! มีผู้เล่น ${playerCount} คน`);
    addLog(`ตาของ ${getCurrentPlayer().name}`);
}

function dealCards() {
    const playerCount = gameState.players.length;
    const cardsPerPlayer = Math.floor(gameState.deck.length / playerCount);
    
    gameState.players.forEach((player, index) => {
        const start = index * cardsPerPlayer;
        player.hand = gameState.deck.slice(start, start + cardsPerPlayer);
    });
}

// ===== Rendering =====
function renderGame() {
    renderPlayersArea();
    renderCurrentPlayerHand();
    updateTurnDisplay();
}

function renderPlayersArea() {
    elements.playersArea.innerHTML = '';
    
    gameState.players.forEach((player, index) => {
        const panel = document.createElement('div');
        panel.className = 'player-panel';
        if (index === gameState.currentPlayerIndex) {
            panel.classList.add('current-turn');
        }
        if (index === gameState.receivingPlayerIndex) {
            panel.classList.add('viewing');
        }
        
        // Count face-up cards by creature
        const creatureCounts = {};
        player.faceUpCards.forEach(card => {
            creatureCounts[card.id] = (creatureCounts[card.id] || 0) + 1;
        });
        
        panel.innerHTML = `
            <div class="player-panel-header">
                <span class="player-name">
                    ${index === gameState.currentPlayerIndex ? '<span class="turn-indicator"></span>' : ''}
                    ${player.name}
                </span>
                <span class="hand-count">🃏 ${player.hand.length}</span>
            </div>
            <div class="face-up-cards">
                ${player.faceUpCards.map(card => `
                    <div class="face-up-card" title="${card.name}">${card.emoji}</div>
                `).join('')}
                ${player.faceUpCards.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.85rem;">ยังไม่มีการ์ดหงาย</span>' : ''}
            </div>
            ${Object.keys(creatureCounts).length > 0 ? `
                <div class="face-up-cards-count">
                    ${Object.entries(creatureCounts).map(([id, count]) => {
                        const creature = CREATURES.find(c => c.id === id);
                        const isDanger = count >= 3;
                        return `<span class="creature-count ${isDanger ? 'danger' : ''}">${creature.emoji} ${count}</span>`;
                    }).join('')}
                </div>
            ` : ''}
        `;
        
        elements.playersArea.appendChild(panel);
    });
}

function renderCurrentPlayerHand() {
    const player = getCurrentPlayer();
    elements.handOwnerName.textContent = `การ์ดในมือของ ${player.name}`;
    elements.handCount.textContent = `${player.hand.length} ใบ`;
    
    elements.playerHand.innerHTML = '';
    
    if (player.hand.length === 0) {
        elements.playerHand.innerHTML = '<p style="color: var(--text-muted);">ไม่มีการ์ดในมือ</p>';
        return;
    }
    
    const canPlay = gameState.phase === 'playing' && !gameState.pendingCard;
    
    player.hand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'hand-card';
        if (!canPlay) {
            cardEl.classList.add('disabled');
        }
        cardEl.innerHTML = `
            <span class="card-emoji">${card.emoji}</span>
            <span class="card-name">${card.name}</span>
        `;
        
        if (canPlay) {
            cardEl.addEventListener('click', () => selectCardToSend(card, index));
        }
        
        elements.playerHand.appendChild(cardEl);
    });
}

function updateTurnDisplay() {
    const player = getCurrentPlayer();
    elements.currentTurnDisplay.textContent = `ตาของ: ${player.name}`;
}

// ===== Card Sending =====
function selectCardToSend(card, index) {
    sendModalState = {
        selectedCard: { ...card, handIndex: index },
        targetPlayer: null,
        claimedCreature: null
    };
    
    // Display selected card
    elements.selectedCardDisplay.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${card.name}</span>
    `;
    
    // Generate target options
    elements.targetPlayerOptions.innerHTML = '';
    gameState.players.forEach((player, idx) => {
        if (idx !== gameState.currentPlayerIndex) {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.textContent = player.name;
            btn.addEventListener('click', () => selectTargetPlayer(idx, btn));
            elements.targetPlayerOptions.appendChild(btn);
        }
    });
    
    // Generate animal claim options
    elements.claimAnimalOptions.innerHTML = '';
    CREATURES.forEach(creature => {
        const btn = document.createElement('button');
        btn.className = 'animal-btn';
        btn.innerHTML = `${creature.emoji} ${creature.name}`;
        btn.addEventListener('click', () => selectClaimCreature(creature, btn));
        elements.claimAnimalOptions.appendChild(btn);
    });
    
    elements.confirmSendBtn.disabled = true;
    showModal(elements.sendCardModal);
}

function selectTargetPlayer(index, btn) {
    document.querySelectorAll('#target-player-options .target-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    sendModalState.targetPlayer = index;
    updateSendConfirmButton();
}

function selectClaimCreature(creature, btn) {
    document.querySelectorAll('#claim-animal-options .animal-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    sendModalState.claimedCreature = creature;
    updateSendConfirmButton();
}

function updateSendConfirmButton() {
    elements.confirmSendBtn.disabled = !(sendModalState.targetPlayer !== null && sendModalState.claimedCreature !== null);
}

function confirmSendCard() {
    const { selectedCard, targetPlayer, claimedCreature } = sendModalState;
    const currentPlayer = getCurrentPlayer();
    
    // Remove card from hand
    currentPlayer.hand.splice(selectedCard.handIndex, 1);
    
    // Set pending card
    gameState.pendingCard = {
        card: selectedCard,
        fromPlayerIndex: gameState.currentPlayerIndex,
        claimedCreature: claimedCreature,
        seenBy: [gameState.currentPlayerIndex]
    };
    gameState.receivingPlayerIndex = targetPlayer;
    
    // Log
    addLog(`${currentPlayer.name} ส่งการ์ดให้ ${gameState.players[targetPlayer].name} และบอกว่าเป็น "${claimedCreature.emoji} ${claimedCreature.name}"`);
    
    closeModal(elements.sendCardModal);
    
    // Show switch player modal then receive modal
    showSwitchPlayerModal(targetPlayer, () => {
        showReceiveModal();
    });
}

function closeSendModal() {
    closeModal(elements.sendCardModal);
    sendModalState = { selectedCard: null, targetPlayer: null, claimedCreature: null };
}

// ===== Receiving Card =====
function showReceiveModal() {
    const { pendingCard } = gameState;
    const fromPlayer = gameState.players[pendingCard.fromPlayerIndex];
    const receiver = gameState.players[gameState.receivingPlayerIndex];
    
    elements.receiveMessage.textContent = `${fromPlayer.name} ส่งการ์ดมาให้คุณ และบอกว่านี่คือ:`;
    elements.claimedAnimalDisplay.textContent = `${pendingCard.claimedCreature.emoji}`;
    
    // Check if can pass (there must be someone who hasn't seen the card)
    const canPass = gameState.players.some((p, idx) => 
        idx !== gameState.receivingPlayerIndex && !pendingCard.seenBy.includes(idx)
    );
    elements.passBtn.disabled = !canPass;
    
    renderGame();
    showModal(elements.receiveCardModal);
}

// ===== Guessing =====
function handleGuess(believes) {
    const { pendingCard } = gameState;
    const actualCreature = pendingCard.card;
    const claimedCreature = pendingCard.claimedCreature;
    const isTruth = actualCreature.id === claimedCreature.id;
    
    // believes = true means "I believe this IS what you claim"
    // believes = false means "I don't believe this IS what you claim"
    const guessedCorrectly = (believes && isTruth) || (!believes && !isTruth);
    
    const receiver = gameState.players[gameState.receivingPlayerIndex];
    const sender = gameState.players[pendingCard.fromPlayerIndex];
    
    let loserIndex;
    if (guessedCorrectly) {
        // Receiver wins, sender gets the card
        loserIndex = pendingCard.fromPlayerIndex;
        sender.faceUpCards.push(pendingCard.card);
    } else {
        // Receiver loses, gets the card
        loserIndex = gameState.receivingPlayerIndex;
        receiver.faceUpCards.push(pendingCard.card);
    }
    
    const loser = gameState.players[loserIndex];
    
    // Log
    const guessText = believes ? 'เชื่อ' : 'ไม่เชื่อ';
    addLog(`${receiver.name} เลือก "${guessText}" - ${guessedCorrectly ? 'ทายถูก!' : 'ทายผิด!'}`);
    addLog(`การ์ด "${actualCreature.emoji} ${actualCreature.name}" วางหงายหน้า ${loser.name}`, 'result');
    
    closeModal(elements.receiveCardModal);
    
    // Show result
    showResultModal(
        guessedCorrectly ? 'ทายถูก! 🎉' : 'ทายผิด! 😱',
        pendingCard.card,
        `การ์ดจริงคือ "${actualCreature.emoji} ${actualCreature.name}"`,
        `${receiver.name} ${guessedCorrectly ? 'ชนะ' : 'แพ้'}รอบนี้ - การ์ดวางที่ ${loser.name}`
    );
    
    // Next turn goes to loser
    gameState.nextPlayerIndex = loserIndex;
}

// ===== Passing Card =====
function handlePassChoice() {
    closeModal(elements.receiveCardModal);
    
    const { pendingCard } = gameState;
    
    // Add current receiver to seenBy
    pendingCard.seenBy.push(gameState.receivingPlayerIndex);
    
    // Show pass modal
    passModalState = { targetPlayer: null, claimedCreature: null };
    
    // Display the actual card (revealed to passer)
    elements.revealedCardDisplay.innerHTML = `
        <span class="card-emoji">${pendingCard.card.emoji}</span>
        <span class="card-name">${pendingCard.card.name}</span>
    `;
    
    // Generate target options (only players who haven't seen)
    elements.passTargetOptions.innerHTML = '';
    gameState.players.forEach((player, idx) => {
        if (!pendingCard.seenBy.includes(idx)) {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.textContent = player.name;
            btn.addEventListener('click', () => selectPassTarget(idx, btn));
            elements.passTargetOptions.appendChild(btn);
        }
    });
    
    // Generate animal claim options
    elements.passClaimOptions.innerHTML = '';
    CREATURES.forEach(creature => {
        const btn = document.createElement('button');
        btn.className = 'animal-btn';
        btn.innerHTML = `${creature.emoji} ${creature.name}`;
        btn.addEventListener('click', () => selectPassClaim(creature, btn));
        elements.passClaimOptions.appendChild(btn);
    });
    
    elements.confirmPassBtn.disabled = true;
    showModal(elements.passCardModal);
}

function selectPassTarget(index, btn) {
    document.querySelectorAll('#pass-target-options .target-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    passModalState.targetPlayer = index;
    updatePassConfirmButton();
}

function selectPassClaim(creature, btn) {
    document.querySelectorAll('#pass-claim-options .animal-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    passModalState.claimedCreature = creature;
    updatePassConfirmButton();
}

function updatePassConfirmButton() {
    elements.confirmPassBtn.disabled = !(passModalState.targetPlayer !== null && passModalState.claimedCreature !== null);
}

function confirmPassCard() {
    const { targetPlayer, claimedCreature } = passModalState;
    const passer = gameState.players[gameState.receivingPlayerIndex];
    
    // Update pending card
    gameState.pendingCard.fromPlayerIndex = gameState.receivingPlayerIndex;
    gameState.pendingCard.claimedCreature = claimedCreature;
    gameState.receivingPlayerIndex = targetPlayer;
    
    // Log
    addLog(`${passer.name} ดูการ์ดแล้วส่งต่อให้ ${gameState.players[targetPlayer].name} และบอกว่าเป็น "${claimedCreature.emoji} ${claimedCreature.name}"`);
    
    closeModal(elements.passCardModal);
    
    // Show switch player modal then receive modal
    showSwitchPlayerModal(targetPlayer, () => {
        showReceiveModal();
    });
}

// ===== Result Modal =====
function showResultModal(title, card, message, outcome) {
    elements.resultTitle.textContent = title;
    elements.resultCardDisplay.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${card.name}</span>
    `;
    elements.resultMessage.textContent = message;
    elements.resultOutcome.textContent = outcome;
    
    showModal(elements.resultModal);
}

function continueAfterResult() {
    closeModal(elements.resultModal);
    
    // Clear pending card
    gameState.pendingCard = null;
    gameState.receivingPlayerIndex = null;
    
    // Check for game over
    const loseResult = checkForLoser();
    if (loseResult) {
        showGameOver(loseResult.playerIndex, loseResult.reason);
        return;
    }
    
    // Set next player (loser of round)
    gameState.currentPlayerIndex = gameState.nextPlayerIndex;
    
    // Check if next player has no cards (they lose)
    if (getCurrentPlayer().hand.length === 0) {
        showGameOver(gameState.currentPlayerIndex, 'ไม่มีการ์ดในมือเมื่อถึงตาที่ต้องเล่น');
        return;
    }
    
    addLog(`ตาของ ${getCurrentPlayer().name}`);
    
    // Show switch player modal
    showSwitchPlayerModal(gameState.currentPlayerIndex, () => {
        renderGame();
    });
}

// ===== Game Over Check =====
function checkForLoser() {
    for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        const creatureCounts = {};
        
        player.faceUpCards.forEach(card => {
            creatureCounts[card.id] = (creatureCounts[card.id] || 0) + 1;
        });
        
        for (const [creatureId, count] of Object.entries(creatureCounts)) {
            if (count >= MAX_FACEUP_BEFORE_LOSE) {
                const creature = CREATURES.find(c => c.id === creatureId);
                return {
                    playerIndex: i,
                    reason: `มีการ์ด "${creature.emoji} ${creature.name}" หงายหน้าครบ ${MAX_FACEUP_BEFORE_LOSE} ใบ`
                };
            }
        }
    }
    return null;
}

function showGameOver(loserIndex, reason) {
    gameState.phase = 'gameover';
    const loser = gameState.players[loserIndex];
    
    elements.loserDisplay.textContent = `😭 ${loser.name} แพ้!`;
    elements.gameoverReason.textContent = reason;
    
    addLog(`🏁 เกมจบ! ${loser.name} แพ้ - ${reason}`, 'lose');
    
    showModal(elements.gameoverModal);
}

// ===== Switch Player Modal =====
let switchCallback = null;

function showSwitchPlayerModal(playerIndex, callback) {
    switchCallback = callback;
    const player = gameState.players[playerIndex];
    elements.nextPlayerDisplay.textContent = player.name;
    showModal(elements.switchPlayerModal);
}

function closeSwitchModal() {
    closeModal(elements.switchPlayerModal);
    if (switchCallback) {
        switchCallback();
        switchCallback = null;
    }
}

// ===== Game Reset =====
function resetGame() {
    closeModal(elements.gameoverModal);
    elements.gameScreen.classList.remove('active');
    elements.setupScreen.classList.add('active');
    
    gameState = {
        players: [],
        currentPlayerIndex: 0,
        deck: [],
        phase: 'setup',
        pendingCard: null,
        receivingPlayerIndex: null,
        log: []
    };
}

// ===== Utility Functions =====
function getCurrentPlayer() {
    return gameState.players[gameState.currentPlayerIndex];
}

function showModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

function addLog(message, type = '') {
    const now = new Date();
    const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    
    gameState.log.push({ time, message, type });
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span>${message}`;
    
    elements.gameLog.insertBefore(entry, elements.gameLog.firstChild);
}

// ===== Start =====
init();
