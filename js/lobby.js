/*
 * lobby.js - Handles lobby creation, joining, and management
 * EuroRails Deal Tracker
 */

// Lobby management functionality
const LobbyManager = (function() {
    // Private variables
    let currentLobby = null;
    let currentPlayer = null;
    let players = [];
    let pollingInterval = null;

    // DOM Elements
    const lobbyInfoElement = document.getElementById('lobby-info');
    const currentLobbyNameElement = document.getElementById('current-lobby-name');
    const playerCountElement = document.getElementById('player-count');
    const playerNameInput = document.getElementById('player-name');
    const lobbyNameInput = document.getElementById('lobby-name');
    const joinPlayerNameInput = document.getElementById('join-player-name');
    const joinCodeInput = document.getElementById('join-code');
    const createLobbyBtn = document.getElementById('create-lobby-btn');
    const joinLobbyBtn = document.getElementById('join-lobby-btn');
    const lobbyDisplayNameElement = document.getElementById('lobby-display-name');
    const lobbyCodeElement = document.getElementById('lobby-code');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const generateQrBtn = document.getElementById('generate-qr-btn');
    const qrContainer = document.getElementById('qr-container');
    const qrCodeElement = document.getElementById('qr-code');
    const closeQrBtn = document.getElementById('close-qr-btn');
    const playerListElement = document.getElementById('player-list');
    const proposeDealBtn = document.getElementById('propose-deal-btn');
    const viewDealsBtn = document.getElementById('view-deals-btn');
    const leaveLobbyBtn = document.getElementById('leave-lobby-btn');

    // Initialize lobby functionality
    function init() {
        // Check for existing session
        checkExistingSession();

        // Event listeners
        createLobbyBtn.addEventListener('click', createLobby);
        joinLobbyBtn.addEventListener('click', joinLobby);
        copyCodeBtn.addEventListener('click', copyLobbyCode);
        generateQrBtn.addEventListener('click', generateQrCode);
        closeQrBtn.addEventListener('click', closeQrCode);
        leaveLobbyBtn.addEventListener('click', leaveLobby);
        proposeDealBtn.addEventListener('click', () => ViewManager.showView('deal-creation-view'));
        viewDealsBtn.addEventListener('click', () => {
            ViewManager.showView('deal-offers-view');
            DealManager.refreshDealLists();
        });
    }

    // Check if user is already in a lobby (from localStorage)
    function checkExistingSession() {
        const savedLobby = localStorage.getItem('currentLobby');
        const savedPlayer = localStorage.getItem('currentPlayer');

        if (savedLobby && savedPlayer) {
            currentLobby = JSON.parse(savedLobby);
            currentPlayer = JSON.parse(savedPlayer);

            // Verify the lobby still exists
            fetch(`api/lobbies/${currentLobby.id}`)
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error('Lobby no longer exists');
                    }
                })
                .then(lobby => {
                    // Update current lobby data
                    currentLobby = lobby;
                    localStorage.setItem('currentLobby', JSON.stringify(currentLobby));

                    // Check if player is still in the lobby
                    const playerExists = lobby.players.some(p => p.id === currentPlayer.id);
                    if (playerExists) {
                        enterLobby(lobby);
                    } else {
                        throw new Error('Player no longer in lobby');
                    }
                })
                .catch(error => {
                    console.error('Session validation error:', error);
                    localStorage.removeItem('currentLobby');
                    localStorage.removeItem('currentPlayer');
                    ViewManager.showView('landing-view');
                    showNotification('Your previous session has expired.', 'error');
                });
        }
    }

    // Create a new lobby
    function createLobby() {
        const playerName = playerNameInput.value.trim();
        const lobbyName = lobbyNameInput.value.trim();

        if (!playerName) {
            showNotification('Please enter your name', 'error');
            return;
        }

        if (!lobbyName) {
            showNotification('Please enter a lobby name', 'error');
            return;
        }

        // Generate a unique lobby code
        const lobbyCode = generateLobbyCode();

        // This would be a server request in a real implementation
        // For now, we'll simulate it
        const newLobby = {
            id: generateUniqueId(),
            name: lobbyName,
            code: lobbyCode,
            createdAt: new Date().toISOString(),
            players: []
        };

        const newPlayer = {
            id: generateUniqueId(),
            name: playerName,
            joinedAt: new Date().toISOString(),
            isCreator: true
        };

        // Add player to lobby
        newLobby.players.push(newPlayer);

        // In a real implementation, this would be a POST request to create the lobby
        simulateServerRequest(`api/lobbies`, 'POST', newLobby)
            .then(createdLobby => {
                currentLobby = createdLobby;
                currentPlayer = newPlayer;

                // Save to localStorage
                localStorage.setItem('currentLobby', JSON.stringify(currentLobby));
                localStorage.setItem('currentPlayer', JSON.stringify(currentPlayer));

                enterLobby(createdLobby);
                showNotification('Lobby created successfully!', 'success');
            })
            .catch(error => {
                console.error('Error creating lobby:', error);
                showNotification('Failed to create lobby. Please try again.', 'error');
            });
    }

    // Join an existing lobby
    function joinLobby() {
        const playerName = joinPlayerNameInput.value.trim();
        const lobbyCode = joinCodeInput.value.trim();

        if (!playerName) {
            showNotification('Please enter your name', 'error');
            return;
        }

        if (!lobbyCode) {
            showNotification('Please enter a lobby code', 'error');
            return;
        }

        // In a real implementation, this would be a GET request to find the lobby
        simulateServerRequest(`api/lobbies/code/${lobbyCode}`, 'GET')
            .then(lobby => {
                if (!lobby) {
                    throw new Error('Lobby not found');
                }

                const newPlayer = {
                    id: generateUniqueId(),
                    name: playerName,
                    joinedAt: new Date().toISOString(),
                    isCreator: false
                };

                // Add player to lobby
                lobby.players.push(newPlayer);

                // In a real implementation, this would be a PUT request to update the lobby
                return simulateServerRequest(`api/lobbies/${lobby.id}`, 'PUT', lobby);
            })
            .then(updatedLobby => {
                currentLobby = updatedLobby;
                currentPlayer = updatedLobby.players.find(p => p.name === playerName && !p.isCreator);

                // Save to localStorage
                localStorage.setItem('currentLobby', JSON.stringify(currentLobby));
                localStorage.setItem('currentPlayer', JSON.stringify(currentPlayer));

                enterLobby(updatedLobby);
                showNotification('Joined lobby successfully!', 'success');
            })
            .catch(error => {
                console.error('Error joining lobby:', error);
                showNotification('Failed to join lobby. Please check the code and try again.', 'error');
            });
    }

    // Enter a lobby (setup UI and start polling)
    function enterLobby(lobby) {
        // Update UI elements
        lobbyInfoElement.classList.remove('hidden');
        currentLobbyNameElement.textContent = lobby.name;
        playerCountElement.textContent = lobby.players.length;
        lobbyDisplayNameElement.textContent = lobby.name;
        lobbyCodeElement.textContent = lobby.code;

        // Clear and populate player list
        playerListElement.innerHTML = '';
        lobby.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name + (player.isCreator ? ' (Creator)' : '');
            if (player.id === currentPlayer.id) {
                li.textContent += ' (You)';
                li.style.fontWeight = 'bold';
            }
            playerListElement.appendChild(li);
        });

        // Start polling for lobby updates
        startPolling();

        // Show lobby view
        ViewManager.showView('lobby-view');
    }

    // Leave the current lobby
    function leaveLobby() {
        if (!currentLobby || !currentPlayer) {
            return;
        }

        // Remove player from lobby
        const updatedPlayers = currentLobby.players.filter(p => p.id !== currentPlayer.id);

        // If this was the last player, delete the lobby
        if (updatedPlayers.length === 0) {
            simulateServerRequest(`api/lobbies/${currentLobby.id}`, 'DELETE')
                .then(() => {
                    cleanupLobbySession();
                    showNotification('You left the lobby and it was deleted.', 'success');
                })
                .catch(error => {
                    console.error('Error deleting lobby:', error);
                    showNotification('Failed to leave lobby. Please try again.', 'error');
                });
        } else {
            // Update the lobby with the player removed
            const updatedLobby = { ...currentLobby, players: updatedPlayers };

            // If the player leaving was the creator, assign a new creator
            if (currentPlayer.isCreator) {
                // Make the longest-standing player the new creator
                updatedPlayers.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
                updatedPlayers[0].isCreator = true;
            }

            simulateServerRequest(`api/lobbies/${currentLobby.id}`, 'PUT', updatedLobby)
                .then(() => {
                    cleanupLobbySession();
                    showNotification('You left the lobby successfully.', 'success');
                })
                .catch(error => {
                    console.error('Error leaving lobby:', error);
                    showNotification('Failed to leave lobby. Please try again.', 'error');
                });
        }
    }

    // Clean up lobby session
    function cleanupLobbySession() {
        // Stop polling
        stopPolling();

        // Clear localStorage
        localStorage.removeItem('currentLobby');
        localStorage.removeItem('currentPlayer');

        // Reset variables
        currentLobby = null;
        currentPlayer = null;
        players = [];

        // Update UI
        lobbyInfoElement.classList.add('hidden');
        currentLobbyNameElement.textContent = 'Not in a lobby';
        playerCountElement.textContent = '0';

        // Show landing view
        ViewManager.showView('landing-view');
    }

    // Copy lobby code to clipboard
    function copyLobbyCode() {
        if (!currentLobby) {
            return;
        }

        // Copy to clipboard
        navigator.clipboard.writeText(currentLobby.code)
            .then(() => {
                showNotification('Lobby code copied to clipboard!', 'success');
            })
            .catch(error => {
                console.error('Error copying lobby code:', error);
                showNotification('Failed to copy lobby code. Please try again.', 'error');
            });
    }

    // Generate QR code for joining the lobby
    function generateQrCode() {
        if (!currentLobby) {
            return;
        }

        // In a real implementation, we'd use a QR code library like qrcode.js
        // For now, just simulate it with a placeholder
        qrCodeElement.innerHTML = `
            <div style="padding: 20px; background-color: white;">
                <h3>QR Code for Lobby: ${currentLobby.name}</h3>
                <p>Code: ${currentLobby.code}</p>
                <div style="margin: 20px auto; width: 200px; height: 200px; background-color: #f5f5f5; display: flex; justify-content: center; align-items: center;">
                    [QR Code Placeholder]
                </div>
                <p>Scan with your phone camera to join this lobby</p>
            </div>
        `;

        // Show QR container
        qrContainer.classList.remove('hidden');
    }

    // Close QR code modal
    function closeQrCode() {
        qrContainer.classList.add('hidden');
    }

    // Start polling for lobby updates
    function startPolling() {
        if (pollingInterval) {
            stopPolling();
        }

        // Poll every 5 seconds
        pollingInterval = setInterval(() => {
            if (!currentLobby) {
                stopPolling();
                return;
            }

            // In a real implementation, this would be a GET request to get the latest lobby data
            simulateServerRequest(`api/lobbies/${currentLobby.id}`, 'GET')
                .then(updatedLobby => {
                    if (!updatedLobby) {
                        throw new Error('Lobby no longer exists');
                    }

                    // Check if player is still in the lobby
                    const playerExists = updatedLobby.players.some(p => p.id === currentPlayer.id);
                    if (!playerExists) {
                        throw new Error('Player no longer in lobby');
                    }

                    // Check if there are any changes
                    if (JSON.stringify(updatedLobby) !== JSON.stringify(currentLobby)) {
                        currentLobby = updatedLobby;
                        localStorage.setItem('currentLobby', JSON.stringify(currentLobby));

                        // Update UI
                        playerCountElement.textContent = updatedLobby.players.length;

                        // Update player list
                        playerListElement.innerHTML = '';
                        updatedLobby.players.forEach(player => {
                            const li = document.createElement('li');
                            li.textContent = player.name + (player.isCreator ? ' (Creator)' : '');
                            if (player.id === currentPlayer.id) {
                                li.textContent += ' (You)';
                                li.style.fontWeight = 'bold';
                            }
                            playerListElement.appendChild(li);
                        });
                    }
                })
                .catch(error => {
                    console.error('Polling error:', error);
                    cleanupLobbySession();
                    showNotification('Your session has ended. You have been removed from the lobby.', 'error');
                });
        }, 5000);
    }

    // Stop polling
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Generate a unique lobby code (6 characters)
    function generateLobbyCode() {
        const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return code;
    }

    // Generate a unique ID
    function generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // Simulate a server request (for demonstration purposes)
    function simulateServerRequest(url, method, data) {
        return new Promise((resolve, reject) => {
            console.log(`${method} request to ${url}`, data);

            // Simulate network delay
            setTimeout(() => {
                try {
                    // Get stored data from localStorage
                    const storedLobbies = JSON.parse(localStorage.getItem('lobbies') || '[]');

                    // Process based on the method and URL
                    if (url.startsWith('api/lobbies')) {
                        // Extract lobby ID from URL if present
                        const lobbyIdMatch = url.match(/api\/lobbies\/([^\/]+)/);
                        const lobbyId = lobbyIdMatch ? lobbyIdMatch[1] : null;

                        // Handle different methods
                        if (method === 'GET') {
                            if (url.includes('/code/')) {
                                // Get lobby by code
                                const codeMatch = url.match(/code\/([^\/]+)/);
                                const code = codeMatch ? codeMatch[1] : null;
                                const lobby = storedLobbies.find(l => l.code === code);
                                resolve(lobby || null);
                            } else if (lobbyId) {
                                // Get lobby by ID
                                const lobby = storedLobbies.find(l => l.id === lobbyId);
                                resolve(lobby || null);
                            } else {
                                // Get all lobbies
                                resolve(storedLobbies);
                            }
                        } else if (method === 'POST') {
                            // Create a new lobby
                            storedLobbies.push(data);
                            localStorage.setItem('lobbies', JSON.stringify(storedLobbies));
                            resolve(data);
                        } else if (method === 'PUT' && lobbyId) {
                            // Update a lobby
                            const lobbyIndex = storedLobbies.findIndex(l => l.id === lobbyId);
                            if (lobbyIndex >= 0) {
                                storedLobbies[lobbyIndex] = data;
                                localStorage.setItem('lobbies', JSON.stringify(storedLobbies));
                                resolve(data);
                            } else {
                                reject(new Error('Lobby not found'));
                            }
                        } else if (method === 'DELETE' && lobbyId) {
                            // Delete a lobby
                            const updatedLobbies = storedLobbies.filter(l => l.id !== lobbyId);
                            localStorage.setItem('lobbies', JSON.stringify(updatedLobbies));
                            resolve({ success: true });
                        }
                    } else {
                        reject(new Error('Invalid API endpoint'));
                    }
                } catch (error) {
                    reject(error);
                }
            }, 500); // 500ms delay to simulate network
        });
    }

    // Public methods
    return {
        init,
        getCurrentLobby: () => currentLobby,
        getCurrentPlayer: () => currentPlayer,
        getPlayers: () => currentLobby ? currentLobby.players : [],
        refreshLobby: () => {
            if (currentLobby) {
                simulateServerRequest(`api/lobbies/${currentLobby.id}`, 'GET')
                    .then(updatedLobby => {
                        currentLobby = updatedLobby;
                        localStorage.setItem('currentLobby', JSON.stringify(currentLobby));
                        playerCountElement.textContent = updatedLobby.players.length;
                    })
                    .catch(error => {
                        console.error('Error refreshing lobby:', error);
                    });
            }
        }
    };
})();

// Initialize lobby functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    LobbyManager.init();
});
