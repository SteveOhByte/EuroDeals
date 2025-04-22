// lobby.js - Lobby management functionality for EuroDeals

// DOM elements
const playersList = document.getElementById('players-list');

// Populate the players list
function populatePlayersList(players) {
    // Clear current list
    playersList.innerHTML = '';

    // Add players
    players.forEach(player => {
        addPlayerToList(player);
    });
}

// Add a player to the list
function addPlayerToList(player) {
    // Check if player already exists in the list
    const existingPlayer = document.getElementById(`player-${player.id}`);
    if (existingPlayer) {
        return; // Player already in list
    }

    const playerItem = document.createElement('li');
    playerItem.id = `player-${player.id}`;
    playerItem.className = 'player-item';

    // Highlight current user
    if (player.id === currentUser.id) {
        playerItem.classList.add('current-player');
    }

    const playerName = document.createElement('span');
    playerName.className = player.is_host ? 'player-host' : 'player-name';
    playerName.textContent = player.name;

    playerItem.appendChild(playerName);
    playersList.appendChild(playerItem);
}

// Remove a player from the list
function removePlayerFromList(playerId) {
    const playerItem = document.getElementById(`player-${playerId}`);
    if (playerItem) {
        playersList.removeChild(playerItem);
    }
}

// Check if a player exists in the list
function playerExistsInList(playerId) {
    return !!document.getElementById(`player-${playerId}`);
}

// Get players for deal selection
function getPlayersForDealSelection() {
    const players = [];
    const playerItems = playersList.querySelectorAll('.player-item');

    playerItems.forEach(item => {
        const id = item.id.replace('player-', '');

        // Skip current user
        if (id === currentUser.id) {
            return;
        }

        const nameEl = item.querySelector('.player-name, .player-host');
        let name = nameEl.textContent;

        // Remove "(Host)" from name if present
        name = name.replace(' (Host)', '');

        players.push({
            id,
            name
        });
    });

    return players;
}

// Populate the player selection dropdown for deals
function populatePlayerSelection(selectElement) {
    // Clear current options
    selectElement.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select Player --';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    selectElement.appendChild(defaultOption);

    // Get players for selection
    const players = getPlayersForDealSelection();

    // Add player options
    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        selectElement.appendChild(option);
    });
}

// Handle player connection status
function updatePlayerStatus(playerId, isConnected) {
    const playerItem = document.getElementById(`player-${playerId}`);

    if (playerItem) {
        if (isConnected) {
            playerItem.classList.remove('player-disconnected');
        } else {
            playerItem.classList.add('player-disconnected');
        }
    }
}

// Refresh the lobby data
async function refreshLobbyData() {
    try {
        await fetchLobbyDetails();
        showToast('Lobby data refreshed', 'success');
    } catch (error) {
        showToast('Failed to refresh lobby data', 'error');
    }
}

// Export functions for use in other files
window.populatePlayersList = populatePlayersList;
window.addPlayerToList = addPlayerToList;
window.removePlayerFromList = removePlayerFromList;
window.playerExistsInList = playerExistsInList;
window.getPlayersForDealSelection = getPlayersForDealSelection;
window.populatePlayerSelection = populatePlayerSelection;
window.updatePlayerStatus = updatePlayerStatus;
window.refreshLobbyData = refreshLobbyData;