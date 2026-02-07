/**
 * Cockroach Poker - Online Client
 * Socket.IO Client for Multiplayer
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

// ===== Socket Connection =====
const socket = io();

// ===== Client State =====
let clientState = {
    playerId: null,
    roomCode: null,
    isHost: false,
    gameState: null,
    privateState: {
        hand: [],
        revealedCard: null
    }
};

// ===== DOM Elements =====
const elements = {
    // Screens
    joinScreen: document.getElementById('join-screen'),
    lobbyScreen: document.getElementById('lobby-screen'),
    gameScreen: document.getElementById('game-screen'),

    // Join/Create
    createPlayerName: document.getElementById('create-player-name'),
    joinPlayerName: document.getElementById('join-player-name'),
    roomCodeInput: document.getElementById('room-code-input'),
    createRoomBtn: document.getElementById('create-room-btn'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    errorMessage: document.getElementById('error-message'),

    // Lobby
    lobbyRoomCode: document.getElementById('lobby-room-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    lobbyPlayers: document.getElementById('lobby-players'),
    playerCount: document.getElementById('player-count'),
    waitingText: document.getElementById('waiting-text'),
    startGameBtn: document.getElementById('start-game-btn'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),

    // Game
    headerRoomCode: document.getElementById('header-room-code'),
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
    backToLobbyBtn: document.getElementById('back-to-lobby-btn'),

    // Connection Status
    connectionStatus: document.getElementById('connection-status')
};

// ===== Send Modal State =====
let sendModalState = {
    selectedCard: null,
    cardIndex: null,
    targetPlayer: null,
    claimedCreature: null
};

// ===== Pass Modal State =====
let passModalState = {
    targetPlayer: null,
    claimedCreature: null,
    availableTargets: []
};

// ===== Initialization =====
function init() {
    setupEventListeners();
    setupSocketListeners();
    updateConnectionStatus('connecting');
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Create Room
    elements.createRoomBtn.addEventListener('click', createRoom);
    elements.createPlayerName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createRoom();
    });

    // Join Room
    elements.joinRoomBtn.addEventListener('click', joinRoom);
    elements.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoom();
    });

    // Lobby
    elements.copyCodeBtn.addEventListener('click', copyRoomCode);
    elements.startGameBtn.addEventListener('click', startGame);
    elements.leaveRoomBtn.addEventListener('click', leaveRoom);

    // Send Modal
    elements.cancelSendBtn.addEventListener('click', closeSendModal);
    elements.confirmSendBtn.addEventListener('click', confirmSendCard);

    // Receive Modal
    elements.believeBtn.addEventListener('click', () => handleGuess(true));
    elements.notBelieveBtn.addEventListener('click', () => handleGuess(false));
    elements.passBtn.addEventListener('click', handlePassChoice);

    // Pass Modal
    elements.confirmPassBtn.addEventListener('click', confirmPassCard);

    // Result Modal
    elements.resultContinueBtn.addEventListener('click', closeResultModal);

    // Game Over
    elements.playAgainBtn.addEventListener('click', playAgain);
    elements.backToLobbyBtn.addEventListener('click', backToLobby);
}

function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
    });

    socket.on('gameStateUpdate', (gameState) => {
        clientState.gameState = gameState;
        renderGameState();
    });

    socket.on('privateStateUpdate', (privateState) => {
        clientState.privateState = privateState;
        renderHand();

        // Check if we need to show receive modal
        checkForPendingAction();
    });

    socket.on('guessResult', (result) => {
        showResultModal(result);
    });

    socket.on('playerDisconnected', (data) => {
        showToast(`${data.playerName} หลุดการเชื่อมต่อ`);
    });

    socket.on('playerReconnected', (data) => {
        showToast(`${data.playerName} กลับมาแล้ว`);
    });
}

// ===== Connection Status =====
function updateConnectionStatus(status) {
    elements.connectionStatus.className = 'connection-status ' + status;
    const statusText = elements.connectionStatus.querySelector('.status-text');

    switch (status) {
        case 'connected':
            statusText.textContent = 'เชื่อมต่อแล้ว';
            break;
        case 'disconnected':
            statusText.textContent = 'ขาดการเชื่อมต่อ';
            break;
        case 'connecting':
            statusText.textContent = 'กำลังเชื่อมต่อ...';
            break;
    }
}

// ===== Room Management =====
function createRoom() {
    const playerName = elements.createPlayerName.value.trim();
    if (!playerName) {
        showError('กรุณาใส่ชื่อของคุณ');
        return;
    }

    socket.emit('createRoom', playerName, (response) => {
        if (response.success) {
            clientState.playerId = response.playerId;
            clientState.roomCode = response.roomCode;
            clientState.isHost = true;
            clientState.gameState = response.gameState;

            showScreen('lobby');
            renderLobby();
        } else {
            showError(response.error);
        }
    });
}

function joinRoom() {
    const playerName = elements.joinPlayerName.value.trim();
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();

    if (!playerName) {
        showError('กรุณาใส่ชื่อของคุณ');
        return;
    }

    if (!roomCode || roomCode.length !== 4) {
        showError('กรุณาใส่รหัสห้อง 4 ตัวอักษร');
        return;
    }

    socket.emit('joinRoom', { roomCode, playerName }, (response) => {
        if (response.success) {
            clientState.playerId = response.playerId;
            clientState.roomCode = response.roomCode;
            clientState.isHost = false;
            clientState.gameState = response.gameState;

            showScreen('lobby');
            renderLobby();
        } else {
            showError(response.error);
        }
    });
}

function leaveRoom() {
    window.location.reload();
}

function copyRoomCode() {
    navigator.clipboard.writeText(clientState.roomCode);
    showToast('คัดลอกรหัสห้องแล้ว!');
}

function startGame() {
    socket.emit('startGame', (response) => {
        if (!response.success) {
            showError(response.error);
        }
    });
}

// ===== Rendering =====
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
}

function renderLobby() {
    const { gameState } = clientState;

    if (gameState.phase === 'playing' || gameState.phase === 'gameover') {
        showScreen('game');
        renderGameState();
        return;
    }

    elements.lobbyRoomCode.textContent = clientState.roomCode;
    elements.playerCount.textContent = gameState.players.length;

    // Find my index to determine if host
    const myIndex = gameState.players.findIndex(p => p.id === clientState.playerId);
    clientState.isHost = myIndex === 0;

    // Render players
    elements.lobbyPlayers.innerHTML = '';
    gameState.players.forEach((player, index) => {
        const isMe = player.id === clientState.playerId;
        const playerEl = document.createElement('div');
        playerEl.className = `lobby-player ${index === 0 ? 'host' : ''} ${!player.connected ? 'disconnected' : ''}`;
        playerEl.innerHTML = `
            <span class="player-avatar">${index === 0 ? '👑' : '🎮'}</span>
            <div class="player-info">
                <span class="player-name">
                    ${player.name}
                    ${isMe ? '<span class="player-badge">คุณ</span>' : ''}
                </span>
                <span class="player-status">${!player.connected ? 'หลุดการเชื่อมต่อ' : (index === 0 ? 'Host' : 'ผู้เล่น')}</span>
            </div>
        `;
        elements.lobbyPlayers.appendChild(playerEl);
    });

    // Show/hide start button
    if (clientState.isHost) {
        elements.waitingText.style.display = 'none';
        elements.startGameBtn.style.display = 'flex';
        elements.startGameBtn.disabled = gameState.players.length < 4;
    } else {
        elements.waitingText.style.display = 'block';
        elements.startGameBtn.style.display = 'none';
    }
}

function renderGameState() {
    const { gameState } = clientState;

    if (gameState.phase === 'lobby') {
        showScreen('lobby');
        renderLobby();
        return;
    }

    showScreen('game');
    elements.headerRoomCode.textContent = clientState.roomCode;

    // Update turn display
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    elements.currentTurnDisplay.textContent = `ตาของ: ${currentPlayer.name}`;

    // Render players area
    renderPlayersArea();

    // Render log
    renderLog();

    // Handle game over
    if (gameState.phase === 'gameover') {
        const loser = gameState.players.find((p, i) => {
            const creatureCounts = {};
            p.faceUpCards.forEach(card => {
                creatureCounts[card.id] = (creatureCounts[card.id] || 0) + 1;
            });
            return Object.values(creatureCounts).some(c => c >= 4);
        }) || gameState.players[gameState.currentPlayerIndex];

        elements.loserDisplay.textContent = `😭 ${loser.name} แพ้!`;
        elements.gameoverReason.textContent = gameState.log[0]?.message.split(' - ')[1] || 'Game Over';

        showModal(elements.gameoverModal);
    }
}

function renderPlayersArea() {
    const { gameState } = clientState;
    const myIndex = gameState.players.findIndex(p => p.id === clientState.playerId);

    elements.playersArea.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const isMe = player.id === clientState.playerId;
        const isCurrentTurn = index === gameState.currentPlayerIndex;
        const isReceiving = index === gameState.receivingPlayerIndex;

        const panel = document.createElement('div');
        panel.className = 'player-panel';
        if (isCurrentTurn) panel.classList.add('current-turn');
        if (isReceiving) panel.classList.add('receiving');
        if (isMe) panel.classList.add('is-me');
        if (!player.connected) panel.classList.add('disconnected');

        // Count face-up cards by creature
        const creatureCounts = {};
        player.faceUpCards.forEach(card => {
            creatureCounts[card.id] = (creatureCounts[card.id] || 0) + 1;
        });

        panel.innerHTML = `
            <div class="player-panel-header">
                <span class="player-name">
                    ${isCurrentTurn ? '<span class="turn-indicator"></span>' : ''}
                    ${player.name}
                    ${isMe ? '<span class="me-badge">คุณ</span>' : ''}
                </span>
                <span class="hand-count">🃏 ${player.handCount}</span>
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

function renderHand() {
    const { privateState, gameState } = clientState;
    const myIndex = gameState?.players.findIndex(p => p.id === clientState.playerId);
    const isMyTurn = myIndex === gameState?.currentPlayerIndex;
    const canPlay = gameState?.phase === 'playing' && !gameState?.pendingCard && isMyTurn;

    elements.handOwnerName.textContent = 'การ์ดในมือของคุณ';
    elements.handCount.textContent = `${privateState.hand.length} ใบ`;

    elements.playerHand.innerHTML = '';

    if (privateState.hand.length === 0) {
        elements.playerHand.innerHTML = '<p style="color: var(--text-muted);">ไม่มีการ์ดในมือ</p>';
        return;
    }

    privateState.hand.forEach((card, index) => {
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

function renderLog() {
    const { gameState } = clientState;

    elements.gameLog.innerHTML = '';

    gameState.log.forEach(entry => {
        const logEl = document.createElement('div');
        logEl.className = `log-entry ${entry.type}`;
        logEl.innerHTML = `<span class="log-time">${entry.time}</span>${entry.message}`;
        elements.gameLog.appendChild(logEl);
    });
}

// ===== Action Checking =====
function checkForPendingAction() {
    const { gameState } = clientState;

    if (!gameState || gameState.phase !== 'playing' || !gameState.pendingCard) {
        return;
    }

    const myIndex = gameState.players.findIndex(p => p.id === clientState.playerId);

    // Check if I'm the receiver
    if (myIndex === gameState.receivingPlayerIndex) {
        showReceiveModal();
    }
}

// ===== Send Card =====
function selectCardToSend(card, index) {
    sendModalState = {
        selectedCard: card,
        cardIndex: index,
        targetPlayer: null,
        claimedCreature: null
    };

    // Display selected card
    elements.selectedCardDisplay.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${card.name}</span>
    `;

    const myIndex = clientState.gameState.players.findIndex(p => p.id === clientState.playerId);

    // Generate target options
    elements.targetPlayerOptions.innerHTML = '';
    clientState.gameState.players.forEach((player, idx) => {
        if (idx !== myIndex) {
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
    const { cardIndex, targetPlayer, claimedCreature } = sendModalState;

    socket.emit('sendCard', {
        cardIndex,
        targetPlayerIndex: targetPlayer,
        claimedCreature
    }, (response) => {
        if (!response.success) {
            showError(response.error);
        }
    });

    closeModal(elements.sendCardModal);
}

function closeSendModal() {
    closeModal(elements.sendCardModal);
    sendModalState = { selectedCard: null, cardIndex: null, targetPlayer: null, claimedCreature: null };
}

// ===== Receive Card =====
function showReceiveModal() {
    const { gameState } = clientState;
    const { pendingCard } = gameState;
    const fromPlayer = gameState.players[pendingCard.fromPlayerIndex];

    elements.receiveMessage.textContent = `${fromPlayer.name} ส่งการ์ดมาให้คุณ และบอกว่านี่คือ:`;
    elements.claimedAnimalDisplay.textContent = `${pendingCard.claimedCreature.emoji}`;

    // Check if can pass
    const myIndex = gameState.players.findIndex(p => p.id === clientState.playerId);
    const canPass = gameState.players.some((p, idx) =>
        idx !== myIndex && !pendingCard.seenBy.includes(idx)
    );
    elements.passBtn.disabled = !canPass;

    showModal(elements.receiveCardModal);
}

function handleGuess(believes) {
    socket.emit('guess', believes, (response) => {
        if (!response.success) {
            showError(response.error);
        }
    });

    closeModal(elements.receiveCardModal);
}

// ===== Pass Card =====
function handlePassChoice() {
    closeModal(elements.receiveCardModal);

    // Request to view the card
    socket.emit('viewCard', (response) => {
        if (!response.success) {
            showError(response.error);
            return;
        }

        passModalState = {
            targetPlayer: null,
            claimedCreature: null,
            availableTargets: response.availableTargets
        };

        // Display the revealed card
        elements.revealedCardDisplay.innerHTML = `
            <span class="card-emoji">${response.card.emoji}</span>
            <span class="card-name">${response.card.name}</span>
        `;

        // Generate target options
        elements.passTargetOptions.innerHTML = '';
        response.availableTargets.forEach(target => {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.textContent = target.name;
            btn.addEventListener('click', () => selectPassTarget(target.index, btn));
            elements.passTargetOptions.appendChild(btn);
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
    });
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

    socket.emit('passCard', {
        targetPlayerIndex: targetPlayer,
        claimedCreature
    }, (response) => {
        if (!response.success) {
            showError(response.error);
        }
    });

    closeModal(elements.passCardModal);
}

// ===== Result Modal =====
function showResultModal(result) {
    elements.resultTitle.textContent = result.guessedCorrectly ? 'ทายถูก! 🎉' : 'ทายผิด! 😱';
    elements.resultCardDisplay.innerHTML = `
        <span class="card-emoji">${result.actualCard.emoji}</span>
        <span class="card-name">${result.actualCard.name}</span>
    `;
    elements.resultMessage.textContent = `การ์ดจริงคือ "${result.actualCard.emoji} ${result.actualCard.name}"`;
    elements.resultOutcome.textContent = `การ์ดวางที่ ${result.loserName}`;

    showModal(elements.resultModal);
}

function closeResultModal() {
    closeModal(elements.resultModal);
}

// ===== Game Over =====
function playAgain() {
    socket.emit('playAgain', (response) => {
        if (!response.success) {
            showError(response.error);
        }
    });
    closeModal(elements.gameoverModal);
}

function backToLobby() {
    socket.emit('playAgain', (response) => {
        closeModal(elements.gameoverModal);
    });
}

// ===== Utility Functions =====
function showModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    setTimeout(() => {
        elements.errorMessage.textContent = '';
    }, 3000);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: var(--bg-glass);
        backdrop-filter: blur(10px);
        border-radius: 25px;
        z-index: 2000;
        animation: slideUp 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// ===== Start =====
init();
