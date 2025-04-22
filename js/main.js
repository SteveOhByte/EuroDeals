// main.js - Core functionality for EuroDeals application

// Global variables
let socket;
let currentUser = {
    id: null,
    name: null,
    isHost: false
};
let currentLobby = {
    id: null,
    name: null
};

// DOM elements
const landingView = document.getElementById('landing-view');
const lobbyView = document.getElementById('lobby-view');
const createTab = document.getElementById('create-tab');
const joinTab = document.getElementById('join-tab');
const createLobbyContent = document.getElementById('create-lobby');
const joinLobbyContent = document.getElementById('join-lobby');
const createLobbyForm = document.getElementById('create-lobby-form');
const joinLobbyForm = document.getElementById('join-lobby-form');
const lobbyTitle = document.getElementById('lobby-title');
const lobbyIdDisplay = document.getElementById('lobby-id-display');
const currentPlayerName = document.getElementById('current-player-name');
const copyLobbyIdBtn = document.getElementById('copy-lobby-id');
const showQrBtn = document.getElementById('show-qr');
const qrModal = document.getElementById('qr-modal');
const qrDisplay = document.getElementById('qr-display');
const qrLobbyId = document.getElementById('qr-lobby-id');
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const dissolvelobbyBtn = document.getElementById('dissolve-lobby-btn');
const hostControls = document.getElementById('host-controls');
const toast = document.getElementById('notification-toast');

// Close modal buttons
document.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    });
});

// Tab switching
createTab.addEventListener('click', () => {
    createTab.classList.add('active');
    joinTab.classList.remove('active');
    createLobbyContent.classList.remove('hidden');
    joinLobbyContent.classList.add('hidden');
});

joinTab.addEventListener('click', () => {
    joinTab.classList.add('active');
    createTab.classList.remove('active');
    joinLobbyContent.classList.remove('hidden');
    createLobbyContent.classList.add('hidden');
});

// Create lobby form submission
createLobbyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hostName = document.getElementById('host-name').value.trim();
    const lobbyName = document.getElementById('lobby-name').value.trim();

    if (!hostName || !lobbyName) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/lobbies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hostName, lobbyName })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create lobby');
        }

        const data = await response.json();

        // Save user info
        currentUser = {
            id: data.hostId,
            name: hostName,
            isHost: true
        };

        // Save lobby info
        currentLobby = {
            id: data.lobbyId,
            name: lobbyName
        };

        // Save to local storage
        saveToLocalStorage();

        // Setup socket connection
        setupSocket();

        // Switch to lobby view
        enterLobby();

    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Join lobby form submission
joinLobbyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const playerName = document.getElementById('player-name').value.trim();
    const lobbyId = document.getElementById('lobby-id').value.trim().toUpperCase();

    if (!playerName || !lobbyId) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/lobbies/${lobbyId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerName })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to join lobby');
        }

        const data = await response.json();

        // Save user info
        currentUser = {
            id: data.playerId,
            name: playerName,
            isHost: false
        };

        // Save lobby info
        currentLobby = {
            id: lobbyId,
            name: data.lobbyName
        };

        // Save to local storage
        saveToLocalStorage();

        // Setup socket connection
        setupSocket();

        // Switch to lobby view
        enterLobby();

        // Fetch and display current deals
        fetchLobbyDetails();

    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Setup WebSocket connection
function setupSocket() {
    // Connect to the Socket.IO server
    socket = io();

    // Join the lobby room
    socket.emit('joinLobby', currentLobby.id);

    // Listen for new players joining
    socket.on('playerJoined', (player) => {
        addPlayerToList(player);
        showToast(`${player.name} joined the lobby`, 'success');
    });

    // Listen for new deals
    socket.on('newDeal', (deal) => {
        if (deal.receiver_id === currentUser.id) {
            showDealResponseModal(deal);
        }
        addDealToList(deal);
    });

    // Listen for deal updates
    socket.on('dealUpdated', (deal) => {
        updateDealInList(deal);

        // Show notification based on deal status
        if (deal.status === 'ACCEPTED') {
            showToast(`Deal between ${deal.creator_name} and ${deal.receiver_name} was accepted`, 'success');
        } else if (deal.status === 'REJECTED') {
            showToast(`Deal between ${deal.creator_name} and ${deal.receiver_name} was rejected`, 'error');
        } else if (deal.status === 'COMPLETED') {
            showToast(`Deal between ${deal.creator_name} and ${deal.receiver_name} was completed`, 'success');
        } else if (deal.status === 'CANCELLED') {
            showToast(`Deal between ${deal.creator_name} and ${deal.receiver_name} was cancelled`, 'warning');
        }
    });
}

// Enter the lobby view
function enterLobby() {
    landingView.classList.add('hidden');
    lobbyView.classList.remove('hidden');

    // Update lobby details
    lobbyTitle.textContent = currentLobby.name;
    lobbyIdDisplay.textContent = currentLobby.id;
    currentPlayerName.textContent = currentUser.name;

    // Show host controls if the user is the host
    if (currentUser.isHost) {
        hostControls.classList.remove('hidden');
    } else {
        hostControls.classList.add('hidden');
    }

    // Generate QR code
    generateQRCode();
}

// Fetch lobby details
async function fetchLobbyDetails() {
    try {
        const response = await fetch(`/api/lobbies/${currentLobby.id}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch lobby details');
        }

        const data = await response.json();

        // Update players list
        populatePlayersList(data.players);

        // Update deals list
        populateDealsList(data.deals);

    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Copy lobby ID to clipboard
copyLobbyIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentLobby.id)
        .then(() => {
            showToast('Lobby ID copied to clipboard', 'success');
        })
        .catch(err => {
            showToast('Failed to copy lobby ID', 'error');
        });
});

// Show QR code for lobby joining
showQrBtn.addEventListener('click', () => {
    qrModal.classList.remove('hidden');
    qrLobbyId.textContent = currentLobby.id;
});

// Generate QR code for lobby joining
function generateQRCode() {
    const joinUrl = `${window.location.origin}?lobby=${currentLobby.id}`;

    // Clear previous QR code
    qrDisplay.innerHTML = '';

    // Generate new QR code
    new QRCode(qrDisplay, {
        text: joinUrl,
        width: 256,
        height: 256,
        colorDark: '#34495e',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

// Leave lobby
leaveLobbyBtn.addEventListener('click', () => {
    // Only non-hosts can leave
    if (!currentUser.isHost) {
        leaveAndResetLobby();
    } else {
        showToast('As the host, you cannot leave. You can dissolve the lobby instead.', 'warning');
    }
});

// Dissolve lobby (host only)
dissolvelobbyBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to dissolve this lobby? This action cannot be undone.')) {
        try {
            // In a real implementation, we would call an API to dissolve the lobby
            // For now, we'll just leave
            leaveAndResetLobby();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
});

// Leave and reset lobby state
function leaveAndResetLobby() {
    // Disconnect from socket
    if (socket) {
        socket.emit('leaveLobby', currentLobby.id);
        socket.disconnect();
    }

    // Clear local storage
    localStorage.removeItem('euroDealsUser');
    localStorage.removeItem('euroDealsLobby');

    // Reset current user and lobby
    currentUser = {
        id: null,
        name: null,
        isHost: false
    };

    currentLobby = {
        id: null,
        name: null
    };

    // Return to landing view
    lobbyView.classList.add('hidden');
    landingView.classList.remove('hidden');

    // Reset forms
    createLobbyForm.reset();
    joinLobbyForm.reset();
}

// Save session data to localStorage
function saveToLocalStorage() {
    localStorage.setItem('euroDealsUser', JSON.stringify(currentUser));
    localStorage.setItem('euroDealsLobby', JSON.stringify(currentLobby));
}

// Load session data from localStorage on page load
function loadFromLocalStorage() {
    const savedUser = localStorage.getItem('euroDealsUser');
    const savedLobby = localStorage.getItem('euroDealsLobby');

    if (savedUser && savedLobby) {
        currentUser = JSON.parse(savedUser);
        currentLobby = JSON.parse(savedLobby);

        // Auto-rejoin lobby
        setupSocket();
        enterLobby();
        fetchLobbyDetails();
        return true;
    }

    return false;
}

// Check URL for direct lobby joining
function checkUrlForLobbyJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyId = urlParams.get('lobby');

    if (lobbyId) {
        // Pre-fill the lobby ID in the join form
        document.getElementById('lobby-id').value = lobbyId;
        // Switch to join tab
        joinTab.click();
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = 'toast'; // Reset classes
    toast.classList.add(`toast-${type}`);
    toast.classList.remove('hidden');

    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Try to load saved session
    const sessionLoaded = loadFromLocalStorage();

    if (!sessionLoaded) {
        // Check URL for lobby ID
        checkUrlForLobbyJoin();
    }
});