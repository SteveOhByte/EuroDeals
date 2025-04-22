/**
 * server.js - Main server file for EuroDeals.org
 * This implements the persistent lobby and player functionality
 */

const express = require('express');
const mysql = require('mysql2/promise');
const {v4: uuidv4} = require('uuid');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eurorails-secret-key';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://eurodeals.org' : 'http://localhost:3000',
    credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eurodeals',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    const token = req.cookies.session || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({error: 'Authentication required'});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get player from database to verify they exist
        const [players] = await pool.query(
            'SELECT * FROM players WHERE id = ?',
            [decoded.playerId]
        );

        if (players.length === 0) {
            return res.status(401).json({error: 'Player not found'});
        }

        req.player = players[0];

        // Update last_active timestamp
        await pool.query(
            'UPDATE players SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [decoded.playerId]
        );

        next();
    } catch (err) {
        return res.status(403).json({error: 'Invalid or expired token'});
    }
};

// Generate a unique lobby code (6 characters)
const generateLobbyCode = async () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
    let code;
    let isUnique = false;

    while (!isUnique) {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        // Check if code already exists
        const [lobbies] = await pool.query(
            'SELECT id FROM lobbies WHERE code = ?',
            [code]
        );

        isUnique = lobbies.length === 0;
    }

    return code;
};

// API Routes

// Player authentication/registration
app.post('/api/players', async (req, res) => {
    const {name} = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({error: 'Player name is required'});
    }

    try {
        let playerId;
        let isNewPlayer = true;

        // Check if player already exists with this session
        const token = req.cookies.session;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);

                // Get player from database
                const [players] = await pool.query(
                    'SELECT * FROM players WHERE id = ?',
                    [decoded.playerId]
                );

                if (players.length > 0) {
                    playerId = players[0].id;
                    isNewPlayer = false;

                    // Update player name if different
                    if (players[0].name !== name) {
                        await pool.query(
                            'UPDATE players SET name = ? WHERE id = ?',
                            [name, playerId]
                        );
                    }
                }
            } catch (err) {
                // Token invalid, will create a new player
            }
        }

        // Create new player if needed
        if (isNewPlayer) {
            playerId = uuidv4();
            const sessionId = uuidv4();

            await pool.query(
                'INSERT INTO players (id, name, session_id) VALUES (?, ?, ?)',
                [playerId, name, sessionId]
            );
        }

        // Generate token
        const token = jwt.sign({playerId}, JWT_SECRET, {expiresIn: '30d'});

        // Set cookie
        res.cookie('session', token, {
            maxAge: COOKIE_MAX_AGE,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        return res.status(200).json({
            id: playerId,
            name,
            isNewPlayer
        });
    } catch (error) {
        console.error('Error creating player:', error);
        return res.status(500).json({error: 'Failed to create player'});
    }
});

// Get current player
app.get('/api/players/me', authenticateToken, async (req, res) => {
    // Get player's active lobbies
    const [lobbies] = await pool.query(
        `SELECT l.*, lp.joined_at
         FROM lobbies l
                  JOIN lobby_players lp ON l.id = lp.lobby_id
         WHERE lp.player_id = ?
           AND lp.is_active = TRUE
           AND l.is_active = TRUE`,
        [req.player.id]
    );

    return res.status(200).json({
        player: {
            id: req.player.id,
            name: req.player.name
        },
        activeLobbies: lobbies
    });
});

// Create a new lobby
app.post('/api/lobbies', authenticateToken, async (req, res) => {
    const {name} = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({error: 'Lobby name is required'});
    }

    try {
        const lobbyId = uuidv4();
        const code = await generateLobbyCode();

        // Create lobby
        await pool.query(
            'INSERT INTO lobbies (id, name, code, host_id) VALUES (?, ?, ?, ?)',
            [lobbyId, name, code, req.player.id]
        );

        // Add host to lobby
        await pool.query(
            'INSERT INTO lobby_players (lobby_id, player_id) VALUES (?, ?)',
            [lobbyId, req.player.id]
        );

        // Get created lobby
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ?',
            [lobbyId]
        );

        return res.status(201).json(lobbies[0]);
    } catch (error) {
        console.error('Error creating lobby:', error);
        return res.status(500).json({error: 'Failed to create lobby'});
    }
});

// Get lobby by ID
app.get('/api/lobbies/:id', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Get lobby
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found'});
        }

        const lobby = lobbies[0];

        // Get players in lobby
        const [players] = await pool.query(
            `SELECT p.id,
                    p.name,
                    lp.joined_at,
                    p.last_active,
                    IF(p.id = l.host_id, TRUE, FALSE) as is_host
             FROM players p
                      JOIN lobby_players lp ON p.id = lp.player_id
                      JOIN lobbies l ON lp.lobby_id = l.id
             WHERE lp.lobby_id = ?
               AND lp.is_active = TRUE
             ORDER BY lp.joined_at`,
            [id]
        );

        // Check if player is in this lobby
        const playerInLobby = players.some(p => p.id === req.player.id);

        if (!playerInLobby) {
            // Automatically add them to the lobby if they're trying to access it
            // but don't return error since they might be trying to join
            await pool.query(
                'INSERT INTO lobby_players (lobby_id, player_id) VALUES (?, ?) ' +
                'ON DUPLICATE KEY UPDATE is_active = TRUE',
                [id, req.player.id]
            );
        }

        return res.status(200).json({
            ...lobby,
            players
        });
    } catch (error) {
        console.error('Error getting lobby:', error);
        return res.status(500).json({error: 'Failed to get lobby'});
    }
});

// Get lobby by code
app.get('/api/lobbies/code/:code', authenticateToken, async (req, res) => {
    const {code} = req.params;

    try {
        // Get lobby
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE code = ? AND is_active = TRUE',
            [code]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found'});
        }

        return res.status(200).json(lobbies[0]);
    } catch (error) {
        console.error('Error getting lobby by code:', error);
        return res.status(500).json({error: 'Failed to get lobby'});
    }
});

// Join a lobby
app.post('/api/lobbies/:id/join', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if lobby exists
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found'});
        }

        // Add player to lobby or reactivate them if they were inactive
        await pool.query(
            'INSERT INTO lobby_players (lobby_id, player_id) VALUES (?, ?) ' +
            'ON DUPLICATE KEY UPDATE is_active = TRUE',
            [id, req.player.id]
        );

        // Get updated lobby with players
        const [players] = await pool.query(
            `SELECT p.id,
                    p.name,
                    lp.joined_at,
                    p.last_active,
                    IF(p.id = l.host_id, TRUE, FALSE) as is_host
             FROM players p
                      JOIN lobby_players lp ON p.id = lp.player_id
                      JOIN lobbies l ON lp.lobby_id = l.id
             WHERE lp.lobby_id = ?
               AND lp.is_active = TRUE
             ORDER BY lp.joined_at`,
            [id]
        );

        return res.status(200).json({
            ...lobbies[0],
            players
        });
    } catch (error) {
        console.error('Error joining lobby:', error);
        return res.status(500).json({error: 'Failed to join lobby'});
    }
});

// Leave a lobby (non-host only)
app.post('/api/lobbies/:id/leave', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if lobby exists
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found'});
        }

        // Check if player is the host
        if (lobbies[0].host_id === req.player.id) {
            return res.status(403).json({
                error: 'Host cannot leave the lobby. Use the dissolve option instead.'
            });
        }

        // Mark player as inactive in the lobby
        await pool.query(
            'UPDATE lobby_players SET is_active = FALSE WHERE lobby_id = ? AND player_id = ?',
            [id, req.player.id]
        );

        return res.status(200).json({message: 'Successfully left the lobby'});
    } catch (error) {
        console.error('Error leaving lobby:', error);
        return res.status(500).json({error: 'Failed to leave lobby'});
    }
});

// Dissolve a lobby (host only)
app.delete('/api/lobbies/:id', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if lobby exists and player is host
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND is_active = TRUE',
            [id]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found'});
        }

        if (lobbies[0].host_id !== req.player.id) {
            return res.status(403).json({error: 'Only the host can dissolve the lobby'});
        }

        // Mark lobby as inactive
        await pool.query(
            'UPDATE lobbies SET is_active = FALSE WHERE id = ?',
            [id]
        );

        // Mark all players as inactive in this lobby
        await pool.query(
            'UPDATE lobby_players SET is_active = FALSE WHERE lobby_id = ?',
            [id]
        );

        return res.status(200).json({message: 'Lobby dissolved successfully'});
    } catch (error) {
        console.error('Error dissolving lobby:', error);
        return res.status(500).json({error: 'Failed to dissolve lobby'});
    }
});

// Deal endpoints

// Create a new deal
app.post('/api/deals', authenticateToken, async (req, res) => {
    const {
        lobbyId, receiverId, proposerActions, receiverActions, notes, summary
    } = req.body;

    if (!lobbyId || !receiverId) {
        return res.status(400).json({error: 'Lobby ID and receiver ID are required'});
    }

    try {
        // Check if lobby exists and is active
        const [lobbies] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND is_active = TRUE',
            [lobbyId]
        );

        if (lobbies.length === 0) {
            return res.status(404).json({error: 'Lobby not found or inactive'});
        }

        // Check if both players are in the lobby
        const [proposerInLobby] = await pool.query(
            'SELECT * FROM lobby_players WHERE lobby_id = ? AND player_id = ? AND is_active = TRUE',
            [lobbyId, req.player.id]
        );

        const [receiverInLobby] = await pool.query(
            'SELECT * FROM lobby_players WHERE lobby_id = ? AND player_id = ? AND is_active = TRUE',
            [lobbyId, receiverId]
        );

        if (proposerInLobby.length === 0) {
            return res.status(403).json({error: 'You are not in this lobby'});
        }

        if (receiverInLobby.length === 0) {
            return res.status(403).json({error: 'Receiver is not in this lobby'});
        }

        // Create deal
        const dealId = uuidv4();

        await pool.query(
            'INSERT INTO deals (id, lobby_id, proposer_id, receiver_id, notes, summary) VALUES (?, ?, ?, ?, ?, ?)',
            [dealId, lobbyId, req.player.id, receiverId, notes, summary]
        );

        // Add deal actions
        if (proposerActions && proposerActions.length > 0) {
            for (const action of proposerActions) {
                await pool.query(
                    'INSERT INTO deal_actions (id, deal_id, player_id, action_type, action_data) VALUES (?, ?, ?, ?, ?)',
                    [uuidv4(), dealId, req.player.id, action.type, JSON.stringify(action)]
                );
            }
        }

        if (receiverActions && receiverActions.length > 0) {
            for (const action of receiverActions) {
                await pool.query(
                    'INSERT INTO deal_actions (id, deal_id, player_id, action_type, action_data) VALUES (?, ?, ?, ?, ?)',
                    [uuidv4(), dealId, receiverId, action.type, JSON.stringify(action)]
                );
            }
        }

        // Get the created deal with actions
        const [deals] = await pool.query(
            'SELECT * FROM deals WHERE id = ?',
            [dealId]
        );

        const [actions] = await pool.query(
            'SELECT * FROM deal_actions WHERE deal_id = ?',
            [dealId]
        );

        // Format actions
        const formattedActions = actions.map(action => ({
            ...action,
            action_data: JSON.parse(action.action_data)
        }));

        return res.status(201).json({
            ...deals[0],
            actions: formattedActions
        });
    } catch (error) {
        console.error('Error creating deal:', error);
        return res.status(500).json({error: 'Failed to create deal'});
    }
});

// Get deals
app.get('/api/deals', authenticateToken, async (req, res) => {
    const {lobbyId, status} = req.query;

    try {
        let query = `
            SELECT d.*,
                   p1.name as proposer_name,
                   p2.name as receiver_name
            FROM deals d
                     JOIN players p1 ON d.proposer_id = p1.id
                     JOIN players p2 ON d.receiver_id = p2.id
            WHERE (d.proposer_id = ? OR d.receiver_id = ?)
        `;

        const queryParams = [req.player.id, req.player.id];

        if (lobbyId) {
            query += ' AND d.lobby_id = ?';
            queryParams.push(lobbyId);
        }

        if (status) {
            query += ' AND d.status = ?';
            queryParams.push(status);
        }

        query += ' ORDER BY d.created_at DESC';

        const [deals] = await pool.query(query, queryParams);

        // Get actions for each deal
        const dealsWithActions = await Promise.all(deals.map(async (deal) => {
            const [actions] = await pool.query(
                'SELECT * FROM deal_actions WHERE deal_id = ?',
                [deal.id]
            );

            // Format actions
            const formattedActions = actions.map(action => ({
                ...action,
                action_data: JSON.parse(action.action_data)
            }));

            return {
                ...deal,
                actions: formattedActions
            };
        }));

        return res.status(200).json(dealsWithActions);
    } catch (error) {
        console.error('Error getting deals:', error);
        return res.status(500).json({error: 'Failed to get deals'});
    }
});

// Accept a deal
app.put('/api/deals/:id/accept', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if deal exists
        const [deals] = await pool.query(
            'SELECT * FROM deals WHERE id = ?',
            [id]
        );

        if (deals.length === 0) {
            return res.status(404).json({error: 'Deal not found'});
        }

        const deal = deals[0];

        // Check if player is the receiver
        if (deal.receiver_id !== req.player.id) {
            return res.status(403).json({error: 'Only the receiver can accept the deal'});
        }

        // Check if deal is pending
        if (deal.status !== 'pending') {
            return res.status(400).json({error: 'Only pending deals can be accepted'});
        }

        // Update deal status
        await pool.query(
            'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['accepted', id]
        );

        return res.status(200).json({message: 'Deal accepted successfully'});
    } catch (error) {
        console.error('Error accepting deal:', error);
        return res.status(500).json({error: 'Failed to accept deal'});
    }
});

// Reject a deal
app.put('/api/deals/:id/reject', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if deal exists
        const [deals] = await pool.query(
            'SELECT * FROM deals WHERE id = ?',
            [id]
        );

        if (deals.length === 0) {
            return res.status(404).json({error: 'Deal not found'});
        }

        const deal = deals[0];

        // Check if player is the receiver
        if (deal.receiver_id !== req.player.id) {
            return res.status(403).json({error: 'Only the receiver can reject the deal'});
        }

        // Check if deal is pending
        if (deal.status !== 'pending') {
            return res.status(400).json({error: 'Only pending deals can be rejected'});
        }

        // Update deal status
        await pool.query(
            'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['rejected', id]
        );

        return res.status(200).json({message: 'Deal rejected successfully'});
    } catch (error) {
        console.error('Error rejecting deal:', error);
        return res.status(500).json({error: 'Failed to reject deal'});
    }
});

// Cancel a deal
app.put('/api/deals/:id/cancel', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if deal exists
        const [deals] = await pool.query(
            'SELECT * FROM deals WHERE id = ?',
            [id]
        );

        if (deals.length === 0) {
            return res.status(404).json({error: 'Deal not found'});
        }

        const deal = deals[0];

        // Check if player is the proposer
        if (deal.proposer_id !== req.player.id) {
            return res.status(403).json({error: 'Only the proposer can cancel the deal'});
        }

        // Check if deal is pending
        if (deal.status !== 'pending') {
            return res.status(400).json({error: 'Only pending deals can be cancelled'});
        }

        // Update deal status
        await pool.query(
            'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['cancelled', id]
        );

        return res.status(200).json({message: 'Deal cancelled successfully'});
    } catch (error) {
        console.error('Error cancelling deal:', error);
        return res.status(500).json({error: 'Failed to cancel deal'});
    }
});

// Complete a deal
app.put('/api/deals/:id/complete', authenticateToken, async (req, res) => {
    const {id} = req.params;

    try {
        // Check if deal exists
        const [deals] = await pool.query(
            'SELECT * FROM deals WHERE id = ?',
            [id]
        );

        if (deals.length === 0) {
            return res.status(404).json({error: 'Deal not found'});
        }

        const deal = deals[0];

        // Check if player is part of the deal
        if (deal.proposer_id !== req.player.id && deal.receiver_id !== req.player.id) {
            return res.status(403).json({error: 'You are not part of this deal'});
        }

        // Check if deal is accepted
        if (deal.status !== 'accepted') {
            return res.status(400).json({error: 'Only accepted deals can be marked as completed'});
        }

        // Update deal status
        await pool.query(
            'UPDATE deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['completed', id]
        );

        return res.status(200).json({message: 'Deal marked as completed successfully'});
    } catch (error) {
        console.error('Error completing deal:', error);
        return res.status(500).json({error: 'Failed to complete deal'});
    }
});

// Heartbeat endpoint to keep player active
app.post('/api/heartbeat', authenticateToken, async (req, res) => {
    // Player's last_active is already updated in the authenticateToken middleware
    return res.status(200).json({message: 'Heartbeat received'});
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});