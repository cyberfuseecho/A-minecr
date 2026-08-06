const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

const players = {};
let worldBlocks = {};
const WORLD_FILE = path.join(__dirname, 'world.json');

// --- World Persistence ---
function loadWorld() {
    if (fs.existsSync(WORLD_FILE)) {
        try {
            const data = fs.readFileSync(WORLD_FILE, 'utf8');
            worldBlocks = JSON.parse(data);
            console.log(`Loaded ${Object.keys(worldBlocks).length} saved blocks.`);
        } catch (err) {
            console.error('Error reading world file:', err);
            generateDefaultTerrain();
        }
    } else {
        generateDefaultTerrain();
    }
}

function saveWorld() {
    try {
        fs.writeFileSync(WORLD_FILE, JSON.stringify(worldBlocks));
    } catch (err) {
        console.error('Error saving world file:', err);
    }
}

function generateDefaultTerrain() {
    // Generate a default 24x24 bed of dirt and grass
    for (let x = -12; x < 12; x++) {
        for (let z = -12; z < 12; z++) {
            worldBlocks[`${x},-1,${z}`] = 1; // Grass
            worldBlocks[`${x},-2,${z}`] = 2; // Dirt
            worldBlocks[`${x},-3,${z}`] = 3; // Stone
        }
    }
    saveWorld();
}

loadWorld();

// Dynamic Player Skin Generator
function generateRandomSkin() {
    const skinTones = [0xffccaa, 0x8d5524, 0xe0ac69, 0xf1c27d, 0x3d2c23]; 
    const shirts = [0xd32f2f, 0x388e3c, 0x1976d2, 0xfbc02d, 0x7b1fa2, 0x00bcd4];
    const pants = [0x1a237e, 0x263238, 0x3e2723, 0x4e342e];
    
    return {
        skin: skinTones[Math.floor(Math.random() * skinTones.length)],
        shirt: shirts[Math.floor(Math.random() * shirts.length)],
        pants: pants[Math.floor(Math.random() * pants.length)]
    };
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('join', (name) => {
        const playerName = (name || 'Builder').trim().substring(0, 15);
        players[socket.id] = { 
            name: playerName,
            x: 0, y: 5, z: 0, ry: 0, 
            colors: generateRandomSkin() 
        };

        // Send initialization package to new player
        socket.emit('init', { id: socket.id, players, worldBlocks });

        // Broadcast new player to all others
        socket.broadcast.emit('playerJoin', { id: socket.id, player: players[socket.id] });
        io.emit('chatMessage', { sender: 'System', text: `${playerName} joined the world!` });
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            socket.broadcast.emit('playerMove', { id: socket.id, ...data });
        }
    });

    socket.on('updateBlock', (data) => {
        const blockKey = `${data.x},${data.y},${data.z}`;
        if (data.type === 0) {
            delete worldBlocks[blockKey];
        } else {
            worldBlocks[blockKey] = data.type;
        }
        socket.broadcast.emit('blockUpdate', data);
        saveWorld();
    });

    socket.on('chatMessage', (text) => {
        if (players[socket.id] && text) {
            const cleanText = text.trim().substring(0, 100);
            io.emit('chatMessage', { sender: players[socket.id].name, text: cleanText });
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            io.emit('chatMessage', { sender: 'System', text: `${players[socket.id].name} left.` });
            delete players[socket.id];
            io.emit('playerLeave', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Voxel Multiplayer server online on port ${PORT}`);
});