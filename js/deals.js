// deals.js - Deal management functionality for EuroDeals

// DOM elements
const dealsList = document.getElementById('deals-list');
const newDealBtn = document.getElementById('new-deal-btn');
const newDealModal = document.getElementById('new-deal-modal');
const newDealForm = document.getElementById('new-deal-form');
const dealWithSelect = document.getElementById('deal-with');
const dealTypeSelect = document.getElementById('deal-type');
const dealDescription = document.getElementById('deal-description');
const dealTemplates = document.getElementById('deal-templates');
const templateButtons = document.querySelectorAll('.template-button');
const dealResponseModal = document.getElementById('deal-response-modal');
const dealDetails = document.getElementById('deal-details');
const acceptDealBtn = document.getElementById('accept-deal-btn');
const rejectDealBtn = document.getElementById('reject-deal-btn');
const cancelDealBtns = document.querySelectorAll('.cancel-deal');

// Current deal being responded to
let currentDealResponse = null;

// Event listeners
newDealBtn.addEventListener('click', openNewDealModal);
newDealForm.addEventListener('submit', createNewDeal);
cancelDealBtns.forEach(btn => {
    btn.addEventListener('click', closeModals);
});
acceptDealBtn.addEventListener('click', () => respondToDeal('ACCEPTED'));
rejectDealBtn.addEventListener('click', () => respondToDeal('REJECTED'));

// Deal type select event listener for templates
dealTypeSelect.addEventListener('change', updateTemplateVisibility);

// Template buttons event listeners
templateButtons.forEach(button => {
    button.addEventListener('click', function () {
        insertTemplate(this.textContent.trim());
    });
});

// Open new deal modal
function openNewDealModal() {
    populatePlayerSelection(dealWithSelect);
    newDealModal.classList.remove('hidden');
    updateTemplateVisibility();
}

// Update template visibility based on selected deal type
function updateTemplateVisibility() {
    const selectedType = dealTypeSelect.value;

    templateButtons.forEach(button => {
        const buttonType = button.getAttribute('data-type');

        if (buttonType === selectedType) {
            button.classList.remove('hidden');
        } else {
            button.classList.add('hidden');
        }
    });

    // Show only relevant templates
    const visibleCount = document.querySelectorAll('.template-button:not(.hidden)').length;

    if (visibleCount > 0) {
        dealTemplates.classList.remove('hidden');
    } else {
        dealTemplates.classList.add('hidden');
    }
}

// Insert template into description
function insertTemplate(templateText) {
    dealDescription.value = templateText;
    dealDescription.focus();
}

// Close all modals
function closeModals() {
    newDealModal.classList.add('hidden');
    dealResponseModal.classList.add('hidden');
    newDealForm.reset();
}

// Create a new deal
async function createNewDeal(e) {
    e.preventDefault();

    const receiverId = dealWithSelect.value;
    const dealType = dealTypeSelect.value;
    const description = dealDescription.value.trim();

    if (!receiverId || !dealType || !description) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/deals', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lobbyId: currentLobby.id,
                creatorId: currentUser.id,
                receiverId,
                dealType,
                description
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create deal');
        }

        const data = await response.json();

        // Close modal and reset form
        closeModals();

        // Show success message
        showToast('Deal created successfully', 'success');

    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Populate the deals list
function populateDealsList(deals) {
    // Clear current list
    dealsList.innerHTML = '';

    if (!deals || deals.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = 'No active deals yet. Create one using the "New Deal" button.';
        dealsList.appendChild(emptyMessage);
        return;
    }

    // Add deals
    deals.forEach(deal => {
        addDealToList(deal);
    });
}

// Add a deal to the list
function addDealToList(deal) {
    // Check if deal already exists in the list
    const existingDeal = document.getElementById(`deal-${deal.id}`);
    if (existingDeal) {
        // Update existing deal
        updateDealInList(deal);
        return;
    }

    const dealCard = document.createElement('div');
    dealCard.id = `deal-${deal.id}`;
    dealCard.className = 'deal-card';
    dealCard.setAttribute('data-status', deal.status);
    dealCard.setAttribute('data-id', deal.id);

    // Deal header with title and status
    const dealHeader = document.createElement('div');
    dealHeader.className = 'deal-header';

    const dealTitle = document.createElement('div');
    dealTitle.className = 'deal-title';
    dealTitle.textContent = getDealTypeLabel(deal.deal_type);

    const dealStatus = document.createElement('div');
    dealStatus.className = `deal-status deal-status-${deal.status.toLowerCase()}`;
    dealStatus.textContent = formatStatus(deal.status);

    dealHeader.appendChild(dealTitle);
    dealHeader.appendChild(dealStatus);

    // Deal description
    const descriptionElem = document.createElement('div');
    descriptionElem.className = 'deal-description';
    descriptionElem.textContent = deal.description;

    // Deal participants
    const participants = document.createElement('div');
    participants.className = 'deal-participants';
    participants.textContent = `${deal.creator_name} → ${deal.receiver_name}`;

    // Deal actions
    const actions = document.createElement('div');
    actions.className = 'deal-actions';

    // Add action buttons based on deal status and user role
    if (deal.status === 'PENDING' && deal.receiver_id === currentUser.id) {
        // Receiver can accept or reject
        const acceptBtn = createActionButton('Accept', 'primary', () => {
            respondToDeal('ACCEPTED', deal.id);
        });

        const rejectBtn = createActionButton('Reject', 'danger', () => {
            respondToDeal('REJECTED', deal.id);
        });

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
    } else if (deal.status === 'ACCEPTED' &&
        (deal.creator_id === currentUser.id || deal.receiver_id === currentUser.id)) {
        // Both participants can mark as completed
        const completeBtn = createActionButton('Mark Completed', 'success', () => {
            respondToDeal('COMPLETED', deal.id);
        });

        actions.appendChild(completeBtn);
    }

    // Cancel button for deal creator
    if ((deal.status === 'PENDING' || deal.status === 'ACCEPTED') &&
        deal.creator_id === currentUser.id) {
        const cancelBtn = createActionButton('Cancel', 'secondary', () => {
            respondToDeal('CANCELLED', deal.id);
        });

        actions.appendChild(cancelBtn);
    }

    // Assemble deal card
    dealCard.appendChild(dealHeader);
    dealCard.appendChild(descriptionElem);
    dealCard.appendChild(participants);

    if (actions.children.length > 0) {
        dealCard.appendChild(actions);
    }

    // Add to deals list
    dealsList.appendChild(dealCard);
}

// Create an action button for deals
function createActionButton(text, type, clickHandler) {
    const button = document.createElement('button');
    button.className = `btn btn-${type}`;
    button.textContent = text;
    button.addEventListener('click', clickHandler);
    return button;
}

// Update a deal in the list
function updateDealInList(deal) {
    const dealCard = document.getElementById(`deal-${deal.id}`);

    if (!dealCard) {
        // If the deal doesn't exist, add it
        addDealToList(deal);
        return;
    }

    // Update status
    dealCard.setAttribute('data-status', deal.status);
    const statusElem = dealCard.querySelector('.deal-status');
    statusElem.className = `deal-status deal-status-${deal.status.toLowerCase()}`;
    statusElem.textContent = formatStatus(deal.status);

    // Update actions
    const actions = dealCard.querySelector('.deal-actions');
    if (actions) {
        // Remove all existing actions
        actions.innerHTML = '';

        // Add appropriate actions based on new status
        if (deal.status === 'PENDING' && deal.receiver_id === currentUser.id) {
            // Receiver can accept or reject
            const acceptBtn = createActionButton('Accept', 'primary', () => {
                respondToDeal('ACCEPTED', deal.id);
            });

            const rejectBtn = createActionButton('Reject', 'danger', () => {
                respondToDeal('REJECTED', deal.id);
            });

            actions.appendChild(acceptBtn);
            actions.appendChild(rejectBtn);
        } else if (deal.status === 'ACCEPTED' &&
            (deal.creator_id === currentUser.id || deal.receiver_id === currentUser.id)) {
            // Both participants can mark as completed
            const completeBtn = createActionButton('Mark Completed', 'success', () => {
                respondToDeal('COMPLETED', deal.id);
            });

            actions.appendChild(completeBtn);
        }

        // Cancel button for deal creator
        if ((deal.status === 'PENDING' || deal.status === 'ACCEPTED') &&
            deal.creator_id === currentUser.id) {
            const cancelBtn = createActionButton('Cancel', 'secondary', () => {
                respondToDeal('CANCELLED', deal.id);
            });

            actions.appendChild(cancelBtn);
        }

        // Remove actions container if empty
        if (actions.children.length === 0) {
            dealCard.removeChild(actions);
        }
    } else if (deal.status === 'PENDING' || deal.status === 'ACCEPTED') {
        // Create new actions container if needed
        const newActions = document.createElement('div');
        newActions.className = 'deal-actions';

        if (deal.status === 'PENDING' && deal.receiver_id === currentUser.id) {
            // Receiver can accept or reject
            const acceptBtn = createActionButton('Accept', 'primary', () => {
                respondToDeal('ACCEPTED', deal.id);
            });

            const rejectBtn = createActionButton('Reject', 'danger', () => {
                respondToDeal('REJECTED', deal.id);
            });

            newActions.appendChild(acceptBtn);
            newActions.appendChild(rejectBtn);
        } else if (deal.status === 'ACCEPTED' &&
            (deal.creator_id === currentUser.id || deal.receiver_id === currentUser.id)) {
            // Both participants can mark as completed
            const completeBtn = createActionButton('Mark Completed', 'success', () => {
                respondToDeal('COMPLETED', deal.id);
            });

            newActions.appendChild(completeBtn);
        }

        // Cancel button for deal creator
        if ((deal.status === 'PENDING' || deal.status === 'ACCEPTED') &&
            deal.creator_id === currentUser.id) {
            const cancelBtn = createActionButton('Cancel', 'secondary', () => {
                respondToDeal('CANCELLED', deal.id);
            });

            newActions.appendChild(cancelBtn);
        }

        // Add actions container if it has buttons
        if (newActions.children.length > 0) {
            dealCard.appendChild(newActions);
        }
    }
}

// Remove a deal from the list
function removeDealFromList(dealId) {
    const dealCard = document.getElementById(`deal-${dealId}`);
    if (dealCard) {
        dealsList.removeChild(dealCard);
    }
}

// Format deal status for display
function formatStatus(status) {
    return status.charAt(0) + status.slice(1).toLowerCase();
}

// Get readable label for deal type
function getDealTypeLabel(dealType) {
    switch (dealType) {
        case 'DELIVERY':
            return 'Delivery Service';
        case 'TRACK_USAGE':
            return 'Track Usage';
        case 'COMPLEX':
            return 'Complex Contract';
        case 'OTHER':
            return 'Other Deal';
        default:
            return 'Deal';
    }
}

// Show deal response modal for incoming deal
function showDealResponseModal(deal) {
    currentDealResponse = deal;

    // Populate deal details
    dealDetails.innerHTML = `
        <div class="deal-header">
            <div class="deal-title">${getDealTypeLabel(deal.deal_type)}</div>
            <div class="deal-status deal-status-${deal.status.toLowerCase()}">${formatStatus(deal.status)}</div>
        </div>
        <div class="deal-description">${deal.description}</div>
        <div class="deal-participants">Proposed by: ${deal.creator_name}</div>
    `;

    // Show modal
    dealResponseModal.classList.remove('hidden');
}

// Respond to a deal (accept, reject, complete, cancel)
async function respondToDeal(status, specificDealId = null) {
    // Use either the specifically provided deal ID or the current response deal ID
    const dealId = specificDealId || (currentDealResponse && currentDealResponse.id);

    if (!dealId) {
        showToast('No deal selected', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/deals/${dealId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status,
                playerId: currentUser.id
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to ${status.toLowerCase()} deal`);
        }

        // Close response modal if open
        dealResponseModal.classList.add('hidden');
        currentDealResponse = null;

        // Show success message
        showToast(`Deal ${status.toLowerCase()} successfully`, 'success');

    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Export functions for use in other files
window.populateDealsList = populateDealsList;
window.addDealToList = addDealToList;
window.updateDealInList = updateDealInList;
window.removeDealFromList = removeDealFromList;
window.showDealResponseModal = showDealResponseModal;