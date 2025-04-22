/**
 * persistent-client.js - Client-side modifications for the persistent EuroDeals app
 * This file handles the API communication with the server and session management
 */

// API Service for interacting with the backend
const ApiService = (function () {
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : 'https://eurodeals.org/api';

    // Helper for making API requests
    async function fetchAPI(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const defaultOptions = {
            credentials: 'include', // Include cookies in requests
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const requestOptions = {...defaultOptions, ...options};

        try {
            const response = await fetch(url, requestOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An error occurred');
            }

            return {success: true, data};
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            return {success: false, error: error.message};
        }
    }

    // Start a heartbeat to keep the session alive
    function startHeartbeat() {
        // Send heartbeat every 1 minute
        setInterval(async () => {
            await fetchAPI('/heartbeat', {method: 'POST'});
        }, 60000); // 60 seconds
    }

    // Authentication/Player methods
    async function registerOrLogin(name) {
        return fetchAPI('/players', {
            method: 'POST',
            body: JSON.stringify({name})
        });
    }

    async function getCurrentPlayer() {
        return fetchAPI('/players/me');
    }

    // Lobby methods
    async function createLobby(name) {
        return fetchAPI('/lobbies', {
            method: 'POST',
            body: JSON.stringify({name})
        });
    }

    async function getLobby(id) {
        return fetchAPI(`/lobbies/${id}`);
    }

    async function getLobbyByCode(code) {
        return fetchAPI(`/lobbies/code/${code}`);
    }

    async function joinLobby(id) {
        return fetchAPI(`/lobbies/${id}/join`, {
            method: 'POST'
        });
    }

    async function leaveLobby(id) {
        return fetchAPI(`/lobbies/${id}/leave`, {
            method: 'POST'
        });
    }

    async function dissolveLobby(id) {
        return fetchAPI(`/lobbies/${id}`, {
            method: 'DELETE'
        });
    }

    // Deal methods
    async function createDeal(dealData) {
        return fetchAPI('/deals', {
            method: 'POST',
            body: JSON.stringify(dealData)
        });
    }

    async function getDeals(filters = {}) {
        const queryParams = new URLSearchParams();

        if (filters.lobbyId) {
            queryParams.append('lobbyId', filters.lobbyId);
        }

        if (filters.status) {
            queryParams.append('status', filters.status);
        }

        return fetchAPI(`/deals?${queryParams.toString()}`);
    }

    async function acceptDeal(id) {
        return fetchAPI(`/deals/${id}/accept`, {
            method: 'PUT'
        });
    }

    async function rejectDeal(id) {
        return fetchAPI(`/deals/${id}/reject`, {
            method: 'PUT'
        });
    }

    async function cancelDeal(id) {
        return fetchAPI(`/deals/${id}/cancel`, {
            method: 'PUT'
        });
    }

    async function completeDeal(id) {
        return fetchAPI(`/deals/${id}/complete`, {
            method: 'PUT'
        });
    }

    return {
        startHeartbeat,
        registerOrLogin,
        getCurrentPlayer,
        createLobby,
        getLobby,
        getLobbyByCode,
        joinLobby,
        leaveLobby,
        dissolveLobby,
        createDeal,
        getDeals,
        acceptDeal,
        rejectDeal,
        cancelDeal,
        completeDeal
    };
})();

// Session management system
const SessionManager = (function () {
    let currentPlayer = null;
    let currentLobby = null;

    // Initialize session
    async function init() {
        try {
            // Check for existing session
            const {success, data} = await ApiService.getCurrentPlayer();

            if (success) {
                currentPlayer = data.player;

                // If player is in active lobbies, use the most recent one
                if (data.activeLobbies && data.activeLobbies.length > 0) {
                    // Sort by joined_at, most recent first
                    const lobbies = [...data.activeLobbies].sort((a, b) =>
                        new Date(b.joined_at) - new Date(a.joined_at)
                    );

                    // Get the most recent lobby details
                    const lobbyResult = await ApiService.getLobby(lobbies[0].id);
                    if (lobbyResult.success) {
                        currentLobby = lobbyResult.data;
                        LobbyManager.enterLobby(currentLobby);
                    }
                } else {
                    ViewManager.showView('landing-view');
                }

                // Start heartbeat to keep session alive
                ApiService.startHeartbeat();

                return true;
            } else {
                ViewManager.showView('landing-view');
                return false;
            }
        } catch (error) {
            console.error('Session initialization error:', error);
            ViewManager.showView('landing-view');
            return false;
        }
    }

    // Login or register a player
    async function loginPlayer(name) {
        try {
            const {success, data, error} = await ApiService.registerOrLogin(name);

            if (success) {
                currentPlayer = {
                    id: data.id,
                    name: data.name
                };

                // Start heartbeat to keep session alive
                ApiService.startHeartbeat();

                return {success: true};
            } else {
                return {success: false, error};
            }
        } catch (error) {
            console.error('Login error:', error);
            return {success: false, error: error.message};
        }
    }

    // Get current player
    function getCurrentPlayer() {
        return currentPlayer;
    }

    // Set current lobby
    function setCurrentLobby(lobby) {
        currentLobby = lobby;
    }

    // Get current lobby
    function getCurrentLobby() {
        return currentLobby;
    }

    // Clear session on logout
    function logout() {
        currentPlayer = null;
        currentLobby = null;
        ViewManager.showView('landing-view');
    }

    return {
        init,
        loginPlayer,
        getCurrentPlayer,
        setCurrentLobby,
        getCurrentLobby,
        logout
    };
})();

// Modified LobbyManager to use the server API
const LobbyManager = (function () {
    // Private variables
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
    const dissolveLobbyBtn = document.createElement('button');

    // Initialize lobby functionality
    function init() {
        // Create and add dissolve lobby button
        dissolveLobbyBtn.id = 'dissolve-lobby-btn';
        dissolveLobbyBtn.textContent = 'Dissolve Lobby';
        dissolveLobbyBtn.classList.add('danger');

        const lobbyActions = document.querySelector('.lobby-actions');
        lobbyActions.appendChild(dissolveLobbyBtn);

        // Event listeners
        createLobbyBtn.addEventListener('click', handleCreateLobby);
        joinLobbyBtn.addEventListener('click', handleJoinLobby);
        copyCodeBtn.addEventListener('click', copyLobbyCode);
        generateQrBtn.addEventListener('click', generateQrCode);
        closeQrBtn.addEventListener('click', closeQrCode);
        leaveLobbyBtn.addEventListener('click', handleLeaveLobby);
        dissolveLobbyBtn.addEventListener('click', handleDissolveLobby);
        proposeDealBtn.addEventListener('click', () => ViewManager.showView('deal-creation'));
        viewDealsBtn.addEventListener('click', () => {
            ViewManager.showView('deal-offers');
            DealManager.refreshDealLists();
        });
    }

    // Handle player registration and lobby creation
    async function handleCreateLobby() {
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

        // Register or login player first
        const loginResult = await SessionManager.loginPlayer(playerName);

        if (!loginResult.success) {
            showNotification(`Login failed: ${loginResult.error}`, 'error');
            return;
        }

        // Create lobby
        const {success, data, error} = await ApiService.createLobby(lobbyName);

        if (success) {
            SessionManager.setCurrentLobby(data);
            enterLobby(data);
            showNotification('Lobby created successfully!', 'success');
        } else {
            showNotification(`Failed to create lobby: ${error}`, 'error');
        }
    }

    // Handle player registration and lobby joining
    async function handleJoinLobby() {
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

        // Register or login player first
        const loginResult = await SessionManager.loginPlayer(playerName);

        if (!loginResult.success) {
            showNotification(`Login failed: ${loginResult.error}`, 'error');
            return;
        }

        // Find lobby by code
        const lobbyResult = await ApiService.getLobbyByCode(lobbyCode);

        if (!lobbyResult.success) {
            showNotification(`Lobby not found: ${lobbyResult.error}`, 'error');
            return;
        }

        // Join lobby
        const joinResult = await ApiService.joinLobby(lobbyResult.data.id);

        if (joinResult.success) {
            SessionManager.setCurrentLobby(joinResult.data);
            enterLobby(joinResult.data);
            showNotification('Joined lobby successfully!', 'success');
        } else {
            showNotification(`Failed to join lobby: ${joinResult.error}`, 'error');
        }
    }

    // Handle leaving a lobby
    async function handleLeaveLobby() {
        const currentLobby = SessionManager.getCurrentLobby();

        if (!currentLobby) {
            return;
        }

        const currentPlayer = SessionManager.getCurrentPlayer();
        const isHost = currentLobby.host_id === currentPlayer.id;

        if (isHost) {
            showNotification('As the host, you cannot leave the lobby. You can only dissolve it.', 'error');
            return;
        }

        const {success, error} = await ApiService.leaveLobby(currentLobby.id);

        if (success) {
            cleanupLobbySession();
            showNotification('You left the lobby successfully.', 'success');
        } else {
            showNotification(`Failed to leave lobby: ${error}`, 'error');
        }
    }

    // Handle dissolving a lobby (host only)
    async function handleDissolveLobby() {
        const currentLobby = SessionManager.getCurrentLobby();

        if (!currentLobby) {
            return;
        }

        // Confirm with user
        if (!confirm('Are you sure you want to dissolve this lobby? This will end the session for all players.')) {
            return;
        }

        const {success, error} = await ApiService.dissolveLobby(currentLobby.id);

        if (success) {
            cleanupLobbySession();
            showNotification('You dissolved the lobby successfully.', 'success');
        } else {
            showNotification(`Failed to dissolve lobby: ${error}`, 'error');
        }
    }

    // Enter a lobby (setup UI and start polling)
    function enterLobby(lobby) {
        // Update UI elements
        lobbyInfoElement.classList.remove('hidden');
        currentLobbyNameElement.textContent = lobby.name;
        playerCountElement.textContent = lobby.players ? lobby.players.length : 0;
        lobbyDisplayNameElement.textContent = lobby.name;
        lobbyCodeElement.textContent = lobby.code;

        // Clear and populate player list
        playerListElement.innerHTML = '';

        const currentPlayer = SessionManager.getCurrentPlayer();
        const isHost = lobby.host_id === currentPlayer.id;

        // Show/hide appropriate buttons
        if (isHost) {
            leaveLobbyBtn.classList.add('hidden');
            dissolveLobbyBtn.classList.remove('hidden');
        } else {
            leaveLobbyBtn.classList.remove('hidden');
            dissolveLobbyBtn.classList.add('hidden');
        }

        if (lobby.players) {
            lobby.players.forEach(player => {
                const li = document.createElement('li');
                li.textContent = player.name + (player.is_host ? ' (Host)' : '');

                // Add "You" indicator
                if (player.id === currentPlayer.id) {
                    li.textContent += ' (You)';
                    li.style.fontWeight = 'bold';
                }

                // Add active/inactive indicator
                const lastActive = new Date(player.last_active);
                const now = new Date();
                const minutesSinceActive = Math.floor((now - lastActive) / 1000 / 60);

                if (minutesSinceActive > 2) {
                    li.style.opacity = '0.5';
                    li.innerHTML += ` <span style="color: orange;">(Away)</span>`;
                }

                playerListElement.appendChild(li);
            });
        }

        // Start polling for lobby updates
        startPolling();

        // Show lobby view
        ViewManager.showView('lobby');
    }

    // Clean up lobby session
    function cleanupLobbySession() {
        // Stop polling
        stopPolling();

        // Reset session
        SessionManager.setCurrentLobby(null);

        // Update UI
        lobbyInfoElement.classList.add('hidden');
        currentLobbyNameElement.textContent = 'Not in a lobby';
        playerCountElement.textContent = '0';

        // Show landing view
        ViewManager.showView('landing');
    }

    // Copy lobby code to clipboard
    function copyLobbyCode() {
        const currentLobby = SessionManager.getCurrentLobby();

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
        const currentLobby = SessionManager.getCurrentLobby();

        if (!currentLobby) {
            return;
        }

        // In a real implementation, we'd use a QR code library like qrcode.js
        // For now, create a URL that can be shared
        const joinUrl = `${window.location.origin}?join=${currentLobby.code}`;

        qrCodeElement.innerHTML = `
            <div style="padding: 20px; background-color: white;">
                <h3>QR Code for Lobby: ${currentLobby.name}</h3>
                <p>Code: ${currentLobby.code}</p>
                <p>Share this URL: <br><a href="${joinUrl}" target="_blank">${joinUrl}</a></p>
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
        pollingInterval = setInterval(async () => {
            const currentLobby = SessionManager.getCurrentLobby();

            if (!currentLobby) {
                stopPolling();
                return;
            }

            const {success, data} = await ApiService.getLobby(currentLobby.id);

            if (success) {
                // Update current lobby
                SessionManager.setCurrentLobby(data);

                // Update UI
                playerCountElement.textContent = data.players ? data.players.length : 0;

                // Update player list
                playerListElement.innerHTML = '';

                const currentPlayer = SessionManager.getCurrentPlayer();

                if (data.players) {
                    data.players.forEach(player => {
                        const li = document.createElement('li');
                        li.textContent = player.name + (player.is_host ? ' (Host)' : '');

                        // Add "You" indicator
                        if (player.id === currentPlayer.id) {
                            li.textContent += ' (You)';
                            li.style.fontWeight = 'bold';
                        }

                        // Add active/inactive indicator
                        const lastActive = new Date(player.last_active);
                        const now = new Date();
                        const minutesSinceActive = Math.floor((now - lastActive) / 1000 / 60);

                        if (minutesSinceActive > 2) {
                            li.style.opacity = '0.5';
                            li.innerHTML += ` <span style="color: orange;">(Away)</span>`;
                        }

                        playerListElement.appendChild(li);
                    });
                }
            } else {
                // Lobby might have been dissolved
                cleanupLobbySession();
                showNotification('The lobby is no longer available.', 'error');
            }
        }, 5000);
    }

    // Stop polling
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Check URL for join code on page load
    function checkUrlForJoinCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinCode = urlParams.get('join');

        if (joinCode) {
            // Clear the URL parameter
            window.history.replaceState({}, document.title, window.location.pathname);

            // Pre-fill the join code field
            joinCodeInput.value = joinCode;

            // Focus on the name field
            joinPlayerNameInput.focus();
        }
    }

    // Public methods
    return {
        init,
        enterLobby,
        checkUrlForJoinCode,
        refreshLobby: async function () {
            const currentLobby = SessionManager.getCurrentLobby();
            if (currentLobby) {
                const {success, data} = await ApiService.getLobby(currentLobby.id);
                if (success) {
                    SessionManager.setCurrentLobby(data);
                }
            }
        },
        getPlayers: function () {
            const currentLobby = SessionManager.getCurrentLobby();
            return currentLobby && currentLobby.players ? currentLobby.players : [];
        }
    };
})();

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', async function () {
    // Initialize the application
    await SessionManager.init();

    // Initialize lobby functionality
    LobbyManager.init();

    // Check URL for join code
    LobbyManager.checkUrlForJoinCode();

    // Initialize deal functionality with the new API services
    DealManager.init();
});

// Modified DealManager to use the server API
const DealManager = (function () {
    // Extend the existing DealManager to use the API

    // Submit a deal proposal (modified to use API)
    async function submitDeal() {
        const otherPlayerId = document.getElementById('deal-with').value;

        if (!otherPlayerId) {
            showNotification('Please select a player to propose the deal to', 'error');
            return;
        }

        const currentLobby = SessionManager.getCurrentLobby();
        const currentPlayer = SessionManager.getCurrentPlayer();

        if (!currentLobby || !currentPlayer) {
            showNotification('You must be in a lobby to propose a deal', 'error');
            return;
        }

        // Get your actions
        const yourActions = getActionDetails(document.getElementById('your-actions'));

        // Get their actions
        const theirActions = getActionDetails(document.getElementById('their-actions'));

        // Get additional notes
        const notes = document.getElementById('deal-notes').value.trim();

        // Validate that at least one action is defined
        if (yourActions.length === 0 && theirActions.length === 0) {
            showNotification('Please add at least one action to the deal', 'error');
            return;
        }

        // Create the deal object
        const dealData = {
            lobbyId: currentLobby.id,
            receiverId: otherPlayerId,
            proposerActions: yourActions,
            receiverActions: theirActions,
            notes: notes,
            summary: document.getElementById('deal-summary').textContent
        };

        // Submit deal to API
        const {success, error} = await ApiService.createDeal(dealData);

        if (success) {
            showNotification('Deal proposed successfully!', 'success');

            // Clear form
            clearDealForm();

            // Go back to lobby
            ViewManager.showView('lobby');
        } else {
            showNotification(`Failed to propose deal: ${error}`, 'error');
        }
    }

    // Refresh deal lists (modified to use API)
    async function refreshDealLists() {
        const currentLobby = SessionManager.getCurrentLobby();
        if (!currentLobby) return;

        const {success, data} = await ApiService.getDeals({lobbyId: currentLobby.id});

        if (!success) {
            showNotification('Failed to load deals', 'error');
            return;
        }

        const currentPlayer = SessionManager.getCurrentPlayer();

        // Filter deals by status and role
        const incomingDeals = data.filter(deal =>
            deal.receiver_id === currentPlayer.id &&
            deal.status === 'pending'
        );

        const outgoingDeals = data.filter(deal =>
            deal.proposer_id === currentPlayer.id &&
            deal.status === 'pending'
        );

        const activeDeals = data.filter(deal =>
            (deal.proposer_id === currentPlayer.id || deal.receiver_id === currentPlayer.id) &&
            deal.status === 'accepted'
        );

        // Get DOM elements
        const incomingDealsListElement = document.getElementById('incoming-deals-list');
        const outgoingDealsListElement = document.getElementById('outgoing-deals-list');
        const activeDealsListElement = document.getElementById('active-deals-list');

        // Clear lists
        incomingDealsListElement.innerHTML = '';
        outgoingDealsListElement.innerHTML = '';
        activeDealsListElement.innerHTML = '';

        // Populate incoming deals
        if (incomingDeals.length === 0) {
            incomingDealsListElement.innerHTML = '<p class="empty-list-message">No incoming deal offers.</p>';
        } else {
            incomingDeals.forEach(deal => {
                const dealCard = createDealCard(deal);
                incomingDealsListElement.appendChild(dealCard);
            });
        }

        // Populate outgoing deals
        if (outgoingDeals.length === 0) {
            outgoingDealsListElement.innerHTML = '<p class="empty-list-message">No outgoing deal offers.</p>';
        } else {
            outgoingDeals.forEach(deal => {
                const dealCard = createDealCard(deal);
                outgoingDealsListElement.appendChild(dealCard);
            });
        }

        // Populate active deals
        if (activeDeals.length === 0) {
            activeDealsListElement.innerHTML = '<p class="empty-list-message">No active deals. Propose a deal to get started!</p>';
        } else {
            activeDeals.forEach(deal => {
                const dealCard = createDealCard(deal);
                activeDealsListElement.appendChild(dealCard);
            });
        }
    }

    // Accept a deal (modified to use API)
    async function acceptDeal() {
        const dealId = document.querySelector('#deal-detail-view').getAttribute('data-deal-id');
        if (!dealId) return;

        const {success, error} = await ApiService.acceptDeal(dealId);

        if (success) {
            showNotification('Deal accepted!', 'success');
            refreshDealLists();
            ViewManager.showView('active-deals');
        } else {
            showNotification(`Failed to accept deal: ${error}`, 'error');
        }
    }

    // Reject a deal (modified to use API)
    async function rejectDeal() {
        const dealId = document.querySelector('#deal-detail-view').getAttribute('data-deal-id');
        if (!dealId) return;

        const {success, error} = await ApiService.rejectDeal(dealId);

        if (success) {
            showNotification('Deal rejected', 'error');
            refreshDealLists();
            ViewManager.showView('deal-offers');
        } else {
            showNotification(`Failed to reject deal: ${error}`, 'error');
        }
    }

    // Cancel an offer (modified to use API)
    async function cancelOffer() {
        const dealId = document.querySelector('#deal-detail-view').getAttribute('data-deal-id');
        if (!dealId) return;

        const {success, error} = await ApiService.cancelDeal(dealId);

        if (success) {
            showNotification('Deal offer cancelled', 'error');
            refreshDealLists();
            ViewManager.showView('deal-offers');
        } else {
            showNotification(`Failed to cancel deal: ${error}`, 'error');
        }
    }

    // Mark a deal as completed (modified to use API)
    async function completeDeal() {
        const dealId = document.querySelector('#deal-detail-view').getAttribute('data-deal-id');
        if (!dealId) return;

        const {success, error} = await ApiService.completeDeal(dealId);

        if (success) {
            showNotification('Deal marked as completed!', 'success');
            refreshDealLists();
            ViewManager.showView('active-deals');
        } else {
            showNotification(`Failed to complete deal: ${error}`, 'error');
        }
    }

    // Initialize the deal player selection dropdown
    function initDealPlayerSelect() {
        const dealWithSelect = document.getElementById('deal-with');

        // Clear existing options
        dealWithSelect.innerHTML = '';

        // Get lobby players
        const players = LobbyManager.getPlayers();
        const currentPlayer = SessionManager.getCurrentPlayer();

        // Add other players to the select
        players.forEach(player => {
            if (player.id !== currentPlayer.id) {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name;
                dealWithSelect.appendChild(option);
            }
        });

        // Update deal summary with selected player
        // Need to access this in the original DealManager scope
        updateDealSummary();
    }

    // View deal details (modified to use API)
    async function viewDealDetails(dealId) {
        // Get the deal data
        const {success, data, error} = await ApiService.getDeals({});

        if (!success) {
            showNotification(`Failed to load deal details: ${error}`, 'error');
            return;
        }

        // Find the specific deal
        const deal = data.find(d => d.id === dealId);
        if (!deal) {
            showNotification('Deal not found', 'error');
            return;
        }

        // Store current deal ID in the view
        document.querySelector('#deal-detail-view').setAttribute('data-deal-id', dealId);

        // Format deal details
        let detailsHtml = `
            <h3>Deal between ${deal.proposer_name} and ${deal.receiver_name}</h3>
            <p>Status: <strong>${formatStatus(deal.status)}</strong></p>
            <p>Proposed: ${formatDate(deal.created_at)}</p>
        `;

        if (deal.updated_at && deal.status !== 'pending') {
            detailsHtml += `<p>Last updated: ${formatDate(deal.updated_at)}</p>`;
        }

        detailsHtml += '<div class="deal-terms">';

        // Parse and organize actions
        const proposerActions = deal.actions.filter(a => a.player_id === deal.proposer_id);
        const receiverActions = deal.actions.filter(a => a.player_id === deal.receiver_id);

        // Proposer actions
        if (proposerActions.length > 0) {
            detailsHtml += `<h4>${deal.proposer_name} will:</h4><ul>`;
            proposerActions.forEach(action => {
                detailsHtml += `<li>${formatAction(action.action_data)}</li>`;
            });
            detailsHtml += '</ul>';
        }

        // Receiver actions
        if (receiverActions.length > 0) {
            detailsHtml += `<h4>${deal.receiver_name} will:</h4><ul>`;
            receiverActions.forEach(action => {
                detailsHtml += `<li>${formatAction(action.action_data)}</li>`;
            });
            detailsHtml += '</ul>';
        }

        detailsHtml += '</div>';

        // Notes
        if (deal.notes) {
            detailsHtml += `
                <div class="deal-notes">
                    <h4>Additional Notes:</h4>
                    <p>${deal.notes}</p>
                </div>
            `;
        }

        // Set detail content
        document.getElementById('deal-detail-content').innerHTML = detailsHtml;

        // Show/hide appropriate buttons based on deal status and current player
        const currentPlayer = SessionManager.getCurrentPlayer();
        const isProposer = deal.proposer_id === currentPlayer.id;
        const isReceiver = deal.receiver_id === currentPlayer.id;

        // Hide all buttons first
        document.getElementById('accept-deal-btn').classList.add('hidden');
        document.getElementById('reject-deal-btn').classList.add('hidden');
        document.getElementById('cancel-offer-btn').classList.add('hidden');
        document.getElementById('complete-deal-btn').classList.add('hidden');

        // Show relevant buttons
        if (deal.status === 'pending') {
            if (isReceiver) {
                document.getElementById('accept-deal-btn').classList.remove('hidden');
                document.getElementById('reject-deal-btn').classList.remove('hidden');
            }
            if (isProposer) {
                document.getElementById('cancel-offer-btn').classList.remove('hidden');
            }
        } else if (deal.status === 'accepted') {
            if (isProposer || isReceiver) {
                document.getElementById('complete-deal-btn').classList.remove('hidden');
            }
        }

        // Show deal detail view
        ViewManager.showView('deal-detail');
    }

    // Replace the original init method to use our modified functions
    const originalInit = DealManager.init;

    // Override the original DealManager methods with our modified ones
    return {
        ...DealManager,
        init: function () {
            // Call original init
            originalInit();

            // Override event listeners for our API-based functions
            document.getElementById('submit-deal-btn').addEventListener('click', submitDeal);
            document.getElementById('accept-deal-btn').addEventListener('click', acceptDeal);
            document.getElementById('reject-deal-btn').addEventListener('click', rejectDeal);
            document.getElementById('cancel-offer-btn').addEventListener('click', cancelOffer);
            document.getElementById('complete-deal-btn').addEventListener('click', completeDeal);

            // Set up deal card click handler
            document.addEventListener('click', function (event) {
                if (event.target.closest('.deal-card')) {
                    const dealCard = event.target.closest('.deal-card');
                    const dealId = dealCard.getAttribute('data-deal-id');
                    viewDealDetails(dealId);
                }
            });
        },
        refreshDealLists,
        initDealPlayerSelect
    };
})();