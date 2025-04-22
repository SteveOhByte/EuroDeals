// app.js - Main server file for EuroDeals application

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');

// Initialize express application
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'eurodeals_user',
    password: 'YOUR_PASSWORD_HERE', // Replace with actual password in production
    database: 'eurodeals',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Helper function to generate unique lobby IDs
function generateLobbyId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// API Routes

// Create a new lobby
app.post('/api/lobbies', async (req, res) => {
    const { hostName, lobbyName } = req.body;

    if (!hostName || !lobbyName) {
        return res.status(400).json({ error: 'Host name and lobby name are required' });
    }

    const lobbyId = generateLobbyId();
    const hostId = uuidv4();

    try {
        const connection = await pool.getConnection();

        // Create the lobby
        await connection.execute(
            'INSERT INTO lobbies (id, name, host_id) VALUES (?, ?, ?)',
            [lobbyId, lobbyName, hostId]
        );

        // Add the host as a player
        await connection.execute(
            'INSERT INTO players (id, name, lobby_id, is_host) VALUES (?, ?, ?, true)',
            [hostId, hostName, lobbyId]
        );

        connection.release();

        res.status(201).json({
            lobbyId,
            hostId,
            message: 'Lobby created successfully'
        });
    } catch (error) {
        console.error('Error creating lobby:', error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});

// Join an existing lobby
app.post('/api/lobbies/:lobbyId/join', async (req, res) => {
    const { lobbyId } = req.params;
    const { playerName } = req.body;

    if (!playerName) {
        return res.status(400).json({ error: 'Player name is required' });
    }

    try {
        const connection = await pool.getConnection();

        // Check if the lobby exists and is active
        const [lobbies] = await connection.execute(
            'SELECT * FROM lobbies WHERE id = ? AND active = true',
            [lobbyId]
        );

        if (lobbies.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Lobby not found or inactive' });
        }

        // Check if the player name is already taken in this lobby
        const [existingPlayers] = await connection.execute(
            'SELECT * FROM players WHERE lobby_id = ? AND name = ?',
            [lobbyId, playerName]
        );

        let playerId;

        if (existingPlayers.length > 0) {
            // Player with this name exists, update last_active
            playerId = existingPlayers[0].id;
            await connection.execute(
                'UPDATE players SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
                [playerId]
            );
        } else {
            // Create a new player
            playerId = uuidv4();
            await connection.execute(
                'INSERT INTO players (id, name, lobby_id) VALUES (?, ?, ?)',
                [playerId, playerName, lobbyId]
            );
        }

        // Get all players in the lobby
        const [players] = await connection.execute(
            'SELECT id, name, is_host FROM players WHERE lobby_id = ?',
            [lobbyId]
        );

        // Get lobby details
        const [lobbyDetails] = await connection.execute(
            'SELECT name FROM lobbies WHERE id = ?',
            [lobbyId]
        );

        connection.release();

        // Notify other players in the lobby via WebSocket
        io.to(lobbyId).emit('playerJoined', {
            id: playerId,
            name: playerName,
            isHost: false
        });

        res.status(200).json({
            playerId,
            lobbyName: lobbyDetails[0].name,
            players
        });
    } catch (error) {
        console.error('Error joining lobby:', error);
        res.status(500).json({ error: 'Failed to join lobby' });
    }
});

// Get lobby details
app.get('/api/lobbies/:lobbyId', async (req, res) => {
    const { lobbyId } = req.params;

    try {
        const connection = await pool.getConnection();

        // Get lobby details
        const [lobbies] = await connection.execute(
            'SELECT * FROM lobbies WHERE id = ? AND active = true',
            [lobbyId]
        );

        if (lobbies.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Lobby not found or inactive' });
        }

        // Get all players in the lobby
        const [players] = await connection.execute(
            'SELECT id, name, is_host FROM players WHERE lobby_id = ?',
            [lobbyId]
        );

        // Get all active deals in the lobby
        const [deals] = await connection.execute(
            `SELECT d.*, 
              p1.name as creator_name, 
              p2.name as receiver_name 
       FROM deals d
       JOIN players p1 ON d.creator_id = p1.id
       JOIN players p2 ON d.receiver_id = p2.id
       WHERE d.lobby_id = ? 
       AND d.status IN ('ACCEPTED', 'PENDING')
       ORDER BY d.created_at DESC`,
            [lobbyId]
        );

        connection.release();

        res.status(200).json({
            lobby: lobbies[0],
            players,
            deals
        });
    } catch (error) {
        console.error('Error fetching lobby details:', error);
        res.status(500).json({ error: 'Failed to fetch lobby details' });
    }
});

// Create a new deal
app.post('/api/deals', async (req, res) => {
    const { lobbyId, creatorId, receiverId, dealType, description, terms } = req.body;

    if (!lobbyId || !creatorId || !receiverId || !dealType || !description) {
        return res.status(400).json({ error: 'Missing required fields for deal creation' });
    }

    try {
        const connection = await pool.getConnection();

        // Verify the lobby exists and is active
        const [lobbies] = await connection.execute(
            'SELECT * FROM lobbies WHERE id = ? AND active = true',
            [lobbyId]
        );

        if (lobbies.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Lobby not found or inactive' });
        }

        // Verify both players exist in the lobby
        const [players] = await connection.execute(
            'SELECT id FROM players WHERE (id = ? OR id = ?) AND lobby_id = ?',
            [creatorId, receiverId, lobbyId]
        );

        if (players.length !== 2) {
            connection.release();
            return res.status(400).json({ error: 'One or both players not found in the lobby' });
        }

        // Create the deal
        const dealId = uuidv4();
        await connection.execute(
            `INSERT INTO deals 
       (id, lobby_id, creator_id, receiver_id, deal_type, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
            [dealId, lobbyId, creatorId, receiverId, dealType, description]
        );

        // Add deal terms if provided
        if (terms && terms.length > 0) {
            for (const term of terms) {
                await connection.execute(
                    'INSERT INTO deal_terms (id, deal_id, term_type, value) VALUES (?, ?, ?, ?)',
                    [uuidv4(), dealId, term.type, term.value]
                );
            }
        }

        // Get the newly created deal with player names
        const [dealDetails] = await connection.execute(
            `SELECT d.*, 
              p1.name as creator_name, 
              p2.name as receiver_name 
       FROM deals d
       JOIN players p1 ON d.creator_id = p1.id
       JOIN players p2 ON d.receiver_id = p2.id
       WHERE d.id = ?`,
            [dealId]
        );

        connection.release();

        // Notify players in the lobby via WebSocket
        io.to(lobbyId).emit('newDeal', dealDetails[0]);

        res.status(201).json({
            deal: dealDetails[0],
            message: 'Deal created successfully'
        });
    } catch (error) {
        console.error('Error creating deal:', error);
        res.status(500).json({ error: 'Failed to create deal' });
    }
});

// Update deal status (accept, reject, complete, cancel)
app.patch('/api/deals/:dealId/status', async (req, res) => {
    const { dealId } = req.params;
    const { status, playerId } = req.body;

    if (!status || !playerId) {
        return res.status(400).json({ error: 'Status and player ID are required' });
    }

    if (!['ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const connection = await pool.getConnection();

        // Get the deal details
        const [deals] = await connection.execute(
            'SELECT * FROM deals WHERE id = ?',
            [dealId]
        );

        if (deals.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Deal not found' });
        }

        const deal = deals[0];

        // Check if the player is involved in the deal
        if (playerId !== deal.creator_id && playerId !== deal.receiver_id) {
            connection.release();
            return res.status(403).json({ error: 'Only deal participants can update deal status' });
        }

        // Additional validation based on status
        if (status === 'ACCEPTED' && playerId !== deal.receiver_id) {
            connection.release();
            return res.status(403).json({ error: 'Only the deal receiver can accept a deal' });
        }

        // Update the deal status
        await connection.execute(
            'UPDATE deals SET status = ? WHERE id = ?',
            [status, dealId]
        );

        // Get updated deal with player names
        const [updatedDeal] = await connection.execute(
            `SELECT d.*, 
              p1.name as creator_name, 
              p2.name as receiver_name 
       FROM deals d
       JOIN players p1 ON d.creator_id = p1.id
       JOIN players p2 ON d.receiver_id = p2.id
       WHERE d.id = ?`,
            [dealId]
        );

        connection.release();

        // Notify players in the lobby via WebSocket
        io.to(deal.lobby_id).emit('dealUpdated', updatedDeal[0]);

        res.status(200).json({
            deal: updatedDeal[0],
            message: `Deal ${status.toLowerCase()} successfully`
        });
    } catch (error) {
        console.error('Error updating deal status:', error);
        res.status(500).json({ error: 'Failed to update deal status' });
    }
});

// Socket.IO connection handling
io.on('connection', socket => {
    console.log('New client connected');

    // Join a room for the specific lobby
    socket.on('joinLobby', lobbyId => {
        socket.join(lobbyId);
        console.log(`Client joined lobby: ${lobbyId}`);
    });

    // Leave a lobby
    socket.on('leaveLobby', lobbyId => {
        socket.leave(lobbyId);
        console.log(`Client left lobby: ${lobbyId}`);
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Catch-all route to serve the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server };