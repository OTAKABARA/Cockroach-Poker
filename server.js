/**
 * Cockroach Poker - Online Multiplayer Server
 * Node.js + Express + Socket.IO
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ===== Game Constants =====
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

// ===== Game Rooms =====
const rooms = new Map();

// ===== Helper Functions =====
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

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

function dealCards(room) {
    const playerCount = room.players.length;
    const cardsPerPlayer = Math.floor(room.deck.length / playerCount);

    room.players.forEach((player, index) => {
        const start = index * cardsPerPlayer;
        player.hand = room.deck.slice(start, start + cardsPerPlayer);
    });
}

function checkForLoser(room) {
    for (let i = 0; i < room.players.length; i++) {
        const player = room.players[i];
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

function getPublicGameState(room) {
    return {
        roomCode: room.code,
        phase: room.phase,
        currentPlayerIndex: room.currentPlayerIndex,
        players: room.players.map((p, idx) => ({
            id: p.id,
            name: p.name,
            handCount: p.hand.length,
            faceUpCards: p.faceUpCards,
            isHost: idx === 0,
            connected: p.connected
        })),
        pendingCard: room.pendingCard ? {
            fromPlayerIndex: room.pendingCard.fromPlayerIndex,
            claimedCreature: room.pendingCard.claimedCreature,
            seenBy: room.pendingCard.seenBy
        } : null,
        receivingPlayerIndex: room.receivingPlayerIndex,
        log: room.log
    };
}

function getPrivateState(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    let revealedCard = null;
    if (room.pendingCard && room.pendingCard.seenBy.includes(playerIndex)) {
        revealedCard = room.pendingCard.card;
    }

    return {
        hand: player ? player.hand : [],
        revealedCard: revealedCard
    };
}

function addLog(room, message, type = '') {
    const now = new Date();
    const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    room.log.unshift({ time, message, type });

    // Keep only last 50 log entries
    if (room.log.length > 50) {
        room.log = room.log.slice(0, 50);
    }
}

// ===== Socket.IO Events =====
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create Room
    socket.on('createRoom', (playerName, callback) => {
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        const room = {
            code: roomCode,
            phase: 'lobby',
            players: [{
                id: socket.id,
                name: playerName,
                hand: [],
                faceUpCards: [],
                connected: true
            }],
            deck: [],
            currentPlayerIndex: 0,
            pendingCard: null,
            receivingPlayerIndex: null,
            log: []
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = socket.id;

        console.log(`Room ${roomCode} created by ${playerName}`);

        callback({
            success: true,
            roomCode: roomCode,
            playerId: socket.id,
            gameState: getPublicGameState(room)
        });
    });

    // Join Room
    socket.on('joinRoom', (data, callback) => {
        const { roomCode, playerName } = data;
        const room = rooms.get(roomCode.toUpperCase());

        if (!room) {
            callback({ success: false, error: 'ไม่พบห้องนี้' });
            return;
        }

        if (room.phase !== 'lobby') {
            callback({ success: false, error: 'เกมเริ่มไปแล้ว' });
            return;
        }

        if (room.players.length >= MAX_PLAYERS) {
            callback({ success: false, error: 'ห้องเต็มแล้ว' });
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            hand: [],
            faceUpCards: [],
            connected: true
        });

        socket.join(roomCode.toUpperCase());
        socket.roomCode = roomCode.toUpperCase();
        socket.playerId = socket.id;

        console.log(`${playerName} joined room ${roomCode}`);

        // Notify all players in room
        io.to(room.code).emit('gameStateUpdate', getPublicGameState(room));

        callback({
            success: true,
            roomCode: room.code,
            playerId: socket.id,
            gameState: getPublicGameState(room)
        });
    });

    // Start Game
    socket.on('startGame', (callback) => {
        const room = rooms.get(socket.roomCode);

        if (!room) {
            callback({ success: false, error: 'ไม่พบห้อง' });
            return;
        }

        if (room.players[0].id !== socket.id) {
            callback({ success: false, error: 'เฉพาะ Host เท่านั้นที่เริ่มเกมได้' });
            return;
        }

        if (room.players.length < MIN_PLAYERS) {
            callback({ success: false, error: `ต้องมีผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน` });
            return;
        }

        // Start game
        room.deck = createDeck();
        dealCards(room);
        room.phase = 'playing';
        room.currentPlayerIndex = 0;
        room.log = [];

        addLog(room, `เกมเริ่มต้น! มีผู้เล่น ${room.players.length} คน`);
        addLog(room, `ตาของ ${room.players[0].name}`);

        // Send state to all players
        room.players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('gameStateUpdate', getPublicGameState(room));
                playerSocket.emit('privateStateUpdate', getPrivateState(room, player.id));
            }
        });

        callback({ success: true });
    });

    // Send Card
    socket.on('sendCard', (data, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing') {
            callback({ success: false, error: 'เกมยังไม่เริ่ม' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== room.currentPlayerIndex) {
            callback({ success: false, error: 'ยังไม่ถึงตาคุณ' });
            return;
        }

        if (room.pendingCard) {
            callback({ success: false, error: 'มีการ์ดกำลังถูกส่งอยู่' });
            return;
        }

        const { cardIndex, targetPlayerIndex, claimedCreature } = data;
        const player = room.players[playerIndex];
        const card = player.hand[cardIndex];

        if (!card) {
            callback({ success: false, error: 'ไม่พบการ์ด' });
            return;
        }

        // Remove card from hand
        player.hand.splice(cardIndex, 1);

        // Set pending card
        room.pendingCard = {
            card: card,
            fromPlayerIndex: playerIndex,
            claimedCreature: claimedCreature,
            seenBy: [playerIndex]
        };
        room.receivingPlayerIndex = targetPlayerIndex;

        addLog(room, `${player.name} ส่งการ์ดให้ ${room.players[targetPlayerIndex].name} และบอกว่าเป็น "${claimedCreature.emoji} ${claimedCreature.name}"`);

        // Update all clients
        room.players.forEach(p => {
            const playerSocket = io.sockets.sockets.get(p.id);
            if (playerSocket) {
                playerSocket.emit('gameStateUpdate', getPublicGameState(room));
                playerSocket.emit('privateStateUpdate', getPrivateState(room, p.id));
            }
        });

        callback({ success: true });
    });

    // Guess (Believe or Not Believe)
    socket.on('guess', (believes, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing' || !room.pendingCard) {
            callback({ success: false, error: 'ไม่สามารถทายได้ตอนนี้' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== room.receivingPlayerIndex) {
            callback({ success: false, error: 'ไม่ใช่ตาของคุณ' });
            return;
        }

        const { pendingCard } = room;
        const actualCreature = pendingCard.card;
        const claimedCreature = pendingCard.claimedCreature;
        const isTruth = actualCreature.id === claimedCreature.id;

        const guessedCorrectly = (believes && isTruth) || (!believes && !isTruth);

        const receiver = room.players[room.receivingPlayerIndex];
        const sender = room.players[pendingCard.fromPlayerIndex];

        let loserIndex;
        if (guessedCorrectly) {
            loserIndex = pendingCard.fromPlayerIndex;
            sender.faceUpCards.push(pendingCard.card);
        } else {
            loserIndex = room.receivingPlayerIndex;
            receiver.faceUpCards.push(pendingCard.card);
        }

        const loser = room.players[loserIndex];
        const guessText = believes ? 'เชื่อ' : 'ไม่เชื่อ';

        addLog(room, `${receiver.name} เลือก "${guessText}" - ${guessedCorrectly ? 'ทายถูก!' : 'ทายผิด!'}`);
        addLog(room, `การ์ด "${actualCreature.emoji} ${actualCreature.name}" วางหงายหน้า ${loser.name}`, 'result');

        // Clear pending card
        room.pendingCard = null;
        room.receivingPlayerIndex = null;

        // Check for game over
        const loseResult = checkForLoser(room);
        if (loseResult) {
            room.phase = 'gameover';
            room.loser = loseResult;
            addLog(room, `🏁 เกมจบ! ${room.players[loseResult.playerIndex].name} แพ้ - ${loseResult.reason}`, 'lose');
        } else {
            // Check if next player has no cards
            if (room.players[loserIndex].hand.length === 0) {
                room.phase = 'gameover';
                room.loser = { playerIndex: loserIndex, reason: 'ไม่มีการ์ดในมือเมื่อถึงตาที่ต้องเล่น' };
                addLog(room, `🏁 เกมจบ! ${room.players[loserIndex].name} แพ้ - ไม่มีการ์ดในมือ`, 'lose');
            } else {
                room.currentPlayerIndex = loserIndex;
                addLog(room, `ตาของ ${room.players[loserIndex].name}`);
            }
        }

        // Prepare result data
        const resultData = {
            guessedCorrectly,
            actualCard: pendingCard.card,
            loserIndex,
            loserName: loser.name
        };

        // Update all clients
        room.players.forEach(p => {
            const playerSocket = io.sockets.sockets.get(p.id);
            if (playerSocket) {
                playerSocket.emit('guessResult', resultData);
                playerSocket.emit('gameStateUpdate', getPublicGameState(room));
                playerSocket.emit('privateStateUpdate', getPrivateState(room, p.id));
            }
        });

        callback({ success: true, result: resultData });
    });

    // Pass Card
    socket.on('passCard', (data, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing' || !room.pendingCard) {
            callback({ success: false, error: 'ไม่สามารถส่งต่อได้ตอนนี้' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== room.receivingPlayerIndex) {
            callback({ success: false, error: 'ไม่ใช่ตาของคุณ' });
            return;
        }

        const { targetPlayerIndex, claimedCreature } = data;

        // Check if target has already seen the card
        if (room.pendingCard.seenBy.includes(targetPlayerIndex)) {
            callback({ success: false, error: 'ผู้เล่นคนนี้เห็นการ์ดแล้ว' });
            return;
        }

        const passer = room.players[playerIndex];

        // Add current player to seenBy
        room.pendingCard.seenBy.push(playerIndex);
        room.pendingCard.fromPlayerIndex = playerIndex;
        room.pendingCard.claimedCreature = claimedCreature;
        room.receivingPlayerIndex = targetPlayerIndex;

        addLog(room, `${passer.name} ดูการ์ดแล้วส่งต่อให้ ${room.players[targetPlayerIndex].name} และบอกว่าเป็น "${claimedCreature.emoji} ${claimedCreature.name}"`);

        // Update all clients
        room.players.forEach(p => {
            const playerSocket = io.sockets.sockets.get(p.id);
            if (playerSocket) {
                playerSocket.emit('gameStateUpdate', getPublicGameState(room));
                playerSocket.emit('privateStateUpdate', getPrivateState(room, p.id));
            }
        });

        callback({ success: true });
    });

    // View Card (when choosing to pass)
    socket.on('viewCard', (callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.pendingCard) {
            callback({ success: false, error: 'ไม่มีการ์ดให้ดู' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== room.receivingPlayerIndex) {
            callback({ success: false, error: 'ไม่ใช่ตาของคุณ' });
            return;
        }

        // Add to seenBy list
        if (!room.pendingCard.seenBy.includes(playerIndex)) {
            room.pendingCard.seenBy.push(playerIndex);
        }

        callback({
            success: true,
            card: room.pendingCard.card,
            availableTargets: room.players
                .map((p, idx) => ({ index: idx, name: p.name }))
                .filter((_, idx) => !room.pendingCard.seenBy.includes(idx))
        });
    });

    // Play Again
    socket.on('playAgain', (callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room) {
            callback({ success: false, error: 'ไม่พบห้อง' });
            return;
        }

        if (room.players[0].id !== socket.id) {
            callback({ success: false, error: 'เฉพาะ Host เท่านั้น' });
            return;
        }

        // Reset game
        room.phase = 'lobby';
        room.deck = [];
        room.currentPlayerIndex = 0;
        room.pendingCard = null;
        room.receivingPlayerIndex = null;
        room.log = [];
        room.loser = null;

        room.players.forEach(p => {
            p.hand = [];
            p.faceUpCards = [];
        });

        // Update all clients
        io.to(room.code).emit('gameStateUpdate', getPublicGameState(room));
        room.players.forEach(p => {
            const playerSocket = io.sockets.sockets.get(p.id);
            if (playerSocket) {
                playerSocket.emit('privateStateUpdate', getPrivateState(room, p.id));
            }
        });

        callback({ success: true });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.connected = false;

                    // Notify others
                    io.to(room.code).emit('gameStateUpdate', getPublicGameState(room));
                    io.to(room.code).emit('playerDisconnected', { playerName: player.name });

                    // If in lobby and all disconnected, remove room
                    if (room.phase === 'lobby' && room.players.every(p => !p.connected)) {
                        rooms.delete(room.code);
                        console.log(`Room ${room.code} deleted (all players left)`);
                    }
                }
            }
        }
    });

    // Reconnect
    socket.on('reconnect', (data, callback) => {
        const { roomCode, playerId } = data;
        const room = rooms.get(roomCode);

        if (!room) {
            callback({ success: false, error: 'ห้องไม่พบหรือถูกลบไปแล้ว' });
            return;
        }

        const player = room.players.find(p => p.id === playerId);
        if (!player) {
            callback({ success: false, error: 'ไม่พบผู้เล่นนี้ในห้อง' });
            return;
        }

        // Update socket
        const oldSocketId = player.id;
        player.id = socket.id;
        player.connected = true;

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = socket.id;

        socket.emit('gameStateUpdate', getPublicGameState(room));
        socket.emit('privateStateUpdate', getPrivateState(room, socket.id));

        io.to(room.code).emit('playerReconnected', { playerName: player.name });

        callback({ success: true, gameState: getPublicGameState(room) });
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🪳 Cockroach Poker Server running on port ${PORT}`);
    console.log(`   Open http://localhost:${PORT} to play`);
});
