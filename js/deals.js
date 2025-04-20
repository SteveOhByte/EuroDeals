/*
 * deals.js - Handles deal creation, management and display
 * EuroRails Deal Tracker
 */

// Deal management functionality
const DealManager = (function() {
    // Private variables
    let currentDeal = null;
    let deals = [];
    let actionTemplates = {};

    // DOM Elements
    const dealWithSelect = document.getElementById('deal-with');
    const yourActionsContainer = document.getElementById('your-actions');
    const theirActionsContainer = document.getElementById('their-actions');
    const addYourActionBtn = document.getElementById('add-your-action');
    const addTheirActionBtn = document.getElementById('add-their-action');
    const dealSummaryElement = document.getElementById('deal-summary');
    const dealNotesElement = document.getElementById('deal-notes');
    const submitDealBtn = document.getElementById('submit-deal-btn');
    const cancelDealBtn = document.getElementById('cancel-deal-btn');
    const incomingDealsListElement = document.getElementById('incoming-deals-list');
    const outgoingDealsListElement = document.getElementById('outgoing-deals-list');
    const activeDealsListElement = document.getElementById('active-deals-list');
    const dealDetailContentElement = document.getElementById('deal-detail-content');
    const acceptDealBtn = document.getElementById('accept-deal-btn');
    const rejectDealBtn = document.getElementById('reject-deal-btn');
    const cancelOfferBtn = document.getElementById('cancel-offer-btn');
    const completeDealBtn = document.getElementById('complete-deal-btn');
    const backFromDetailBtn = document.getElementById('back-from-detail-btn');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const backToLobbyFromOffersBtn = document.getElementById('back-to-lobby-from-offers');

    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');

    // Initialize deal functionality
    function init() {
        // Store action templates for later use
        const templates = document.getElementById('action-templates').children;
        for (let i = 0; i < templates.length; i++) {
            const template = templates[i];
            actionTemplates[template.id.replace('-template', '')] = template.innerHTML;
        }

        // Event listeners
        addYourActionBtn.addEventListener('click', () => showActionTypePicker(yourActionsContainer));
        addTheirActionBtn.addEventListener('click', () => showActionTypePicker(theirActionsContainer));
        dealNotesElement.addEventListener('input', updateDealSummary);
        submitDealBtn.addEventListener('click', submitDeal);
        cancelDealBtn.addEventListener('click', () => ViewManager.showView('lobby-view'));

        acceptDealBtn.addEventListener('click', acceptDeal);
        rejectDealBtn.addEventListener('click', rejectDeal);
        cancelOfferBtn.addEventListener('click', cancelOffer);
        completeDealBtn.addEventListener('click', completeDeal);
        backFromDetailBtn.addEventListener('click', () => {
            if (ViewManager.getPreviousView() === 'deal-offers-view') {
                ViewManager.showView('deal-offers-view');
            } else {
                ViewManager.showView('active-deals-view');
            }
        });

        backToLobbyBtn.addEventListener('click', () => ViewManager.showView('lobby-view'));
        backToLobbyFromOffersBtn.addEventListener('click', () => ViewManager.showView('lobby-view'));

        // Tab switching
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove active class from all tabs
                tabButtons.forEach(btn => btn.classList.remove('active'));

                // Add active class to clicked tab
                this.classList.add('active');

                // Hide all tab content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });

                // Show the selected tab content
                const tabId = this.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });

        // Load deals from localStorage
        loadDeals();

        // Document event delegation for dynamic elements
        document.addEventListener('click', function(event) {
            // Handle deal card clicks
            if (event.target.closest('.deal-card')) {
                const dealCard = event.target.closest('.deal-card');
                const dealId = dealCard.getAttribute('data-deal-id');
                viewDealDetails(dealId);
            }

            // Handle action type selection
            if (event.target.closest('.action-type-option')) {
                const option = event.target.closest('.action-type-option');
                const container = option.closest('.action-container').querySelector('.actions-list');
                const actionType = option.getAttribute('data-action-type');
                addAction(container, actionType);
                closeActionTypePicker(option.closest('.action-type-picker'));
            }

            // Handle remove action button
            if (event.target.classList.contains('remove-action')) {
                const actionItem = event.target.closest('.action-item');
                actionItem.remove();
                updateDealSummary();
            }
        });

        // Document event delegation for change events
        document.addEventListener('change', function(event) {
            // Update deal summary when any form field changes
            if (event.target.closest('#deal-creation-view')) {
                updateDealSummary();
            }

            // Handle special cases for certain inputs
            if (event.target.classList.contains('goods-type')) {
                const customGoodsInput = event.target.closest('.action-details').querySelector('.custom-goods');
                if (event.target.value === 'other') {
                    customGoodsInput.classList.remove('hidden');
                } else {
                    customGoodsInput.classList.add('hidden');
                }
                updateDealSummary();
            }

            if (event.target.classList.contains('track-usage-type')) {
                const feeInput = event.target.closest('.action-details').querySelector('.track-usage-fee');
                if (event.target.value === 'fee') {
                    feeInput.classList.remove('hidden');
                } else {
                    feeInput.classList.add('hidden');
                }
                updateDealSummary();
            }
        });
    }

    // Show action type picker
    function showActionTypePicker(container) {
        // Check if there's already a picker open
        const existingPicker = document.querySelector('.action-type-picker');
        if (existingPicker) {
            existingPicker.remove();
        }

        // Create action type picker
        const picker = document.createElement('div');
        picker.className = 'action-type-picker';
        picker.innerHTML = `
            <h4>Select Action Type</h4>
            <div class="action-type-options">
                <div class="action-type-option" data-action-type="deliver-goods">
                    <span>Deliver Goods</span>
                    <p>Transport goods to a destination</p>
                </div>
                <div class="action-type-option" data-action-type="payment">
                    <span>Payment</span>
                    <p>Pay money under specific conditions</p>
                </div>
                <div class="action-type-option" data-action-type="track-usage">
                    <span>Track Usage</span>
                    <p>Allow usage of your track</p>
                </div>
                <div class="action-type-option" data-action-type="custom-action">
                    <span>Custom Action</span>
                    <p>Describe a custom action</p>
                </div>
            </div>
            <button class="cancel-action-pick">Cancel</button>
        `;

        // Find the actions-list in the container
        let actionsList = container.querySelector('.actions-list');

        // If it doesn't exist, create it
        if (!actionsList) {
            actionsList = document.createElement('div');
            actionsList.className = 'actions-list';
            container.appendChild(actionsList);
        }

        // Create a wrapper to hold both the list and the picker
        const actionContainer = document.createElement('div');
        actionContainer.className = 'action-container';

        // Move the actions-list into the container
        container.removeChild(actionsList);
        actionContainer.appendChild(actionsList);

        // Add the picker to the container
        actionContainer.appendChild(picker);

        // Add the container to the original container
        container.appendChild(actionContainer);

        // Add event listener for cancel button
        picker.querySelector('.cancel-action-pick').addEventListener('click', () => {
            closeActionTypePicker(picker);
        });
    }

    // Close action type picker
    function closeActionTypePicker(picker) {
        if (picker) {
            const actionContainer = picker.closest('.action-container');
            const actionsList = actionContainer.querySelector('.actions-list');
            const parentContainer = actionContainer.parentNode;

            // Move the actions-list back to the parent container
            actionContainer.removeChild(actionsList);
            parentContainer.appendChild(actionsList);

            // Remove the action container
            parentContainer.removeChild(actionContainer);
        }
    }

    // Add action of the specified type
    function addAction(container, actionType) {
        const actionTemplate = actionTemplates[actionType];

        // Create a div to hold the action
        const actionDiv = document.createElement('div');
        actionDiv.innerHTML = actionTemplate;

        // Append to container
        container.appendChild(actionDiv.firstElementChild);

        // Update deal summary
        updateDealSummary();
    }

    // Update the deal summary based on current form values
    function updateDealSummary() {
        const otherPlayer = dealWithSelect.options[dealWithSelect.selectedIndex]?.text || 'the other player';

        // Get your actions
        const yourActions = getActionSummaries(yourActionsContainer);

        // Get their actions
        const theirActions = getActionSummaries(theirActionsContainer);

        // Get additional notes
        const notes = dealNotesElement.value.trim();

        // Build summary
        let summary = '';

        if (yourActions.length > 0) {
            summary += `You will:\n`;
            yourActions.forEach(action => {
                summary += `- ${action}\n`;
            });
            summary += '\n';
        }

        if (theirActions.length > 0) {
            summary += `${otherPlayer} will:\n`;
            theirActions.forEach(action => {
                summary += `- ${action}\n`;
            });
            summary += '\n';
        }

        if (notes) {
            summary += `Additional Notes:\n${notes}\n`;
        }

        // Update summary element
        dealSummaryElement.textContent = summary;
    }

    // Get text summaries of actions in a container
    function getActionSummaries(container) {
        const actionsList = container.querySelector('.actions-list');
        if (!actionsList) return [];

        const actions = [];
        const actionItems = actionsList.querySelectorAll('.action-item');

        actionItems.forEach(item => {
            const actionType = item.querySelector('.action-title').textContent;

            if (actionType === 'Deliver Goods') {
                let goodsType = item.querySelector('.goods-type').value;
                if (goodsType === 'other') {
                    goodsType = item.querySelector('.custom-goods').value || 'goods';
                }

                const quantity = item.querySelector('.goods-quantity').value;
                const destination = item.querySelector('.destination').value || 'the destination';
                const condition = item.querySelector('.delivery-condition').value;

                let actionText = `Deliver ${quantity} ${goodsType} to ${destination}`;
                if (condition === 'leave') {
                    actionText += ' and leave them there';
                } else {
                    actionText += ' for pickup';
                }

                actions.push(actionText);
            }
            else if (actionType === 'Payment') {
                const amount = item.querySelector('.payment-amount').value;
                const condition = item.querySelector('.payment-condition').value;

                let actionText = `Pay ${amount} million`;
                if (condition === 'upfront') {
                    actionText += ' upfront';
                } else if (condition === 'on-completion') {
                    actionText += ' on completion';
                } else if (condition === 'on-pickup') {
                    actionText += ' on pickup';
                }

                actions.push(actionText);
            }
            else if (actionType === 'Track Usage') {
                const usageType = item.querySelector('.track-usage-type').value;
                const times = item.querySelector('.track-usage-times').value;

                let actionText = `Allow track usage ${times} times`;
                if (usageType === 'free') {
                    actionText += ' for free';
                } else {
                    const fee = item.querySelector('.track-usage-fee').value;
                    actionText += ` for a fee of ${fee} million each time`;
                }

                actions.push(actionText);
            }
            else if (actionType === 'Custom Action') {
                const actionText = item.querySelector('.custom-action-text').value || 'Custom action';
                actions.push(actionText);
            }
        });

        return actions;
    }

    // Submit a deal proposal
    function submitDeal() {
        const otherPlayerId = dealWithSelect.value;

        if (!otherPlayerId) {
            showNotification('Please select a player to propose the deal to', 'error');
            return;
        }

        const currentLobby = LobbyManager.getCurrentLobby();
        const currentPlayer = LobbyManager.getCurrentPlayer();

        if (!currentLobby || !currentPlayer) {
            showNotification('You must be in a lobby to propose a deal', 'error');
            return;
        }

        // Get the other player's name
        const otherPlayer = currentLobby.players.find(p => p.id === otherPlayerId);

        // Get your actions
        const yourActions = getActionDetails(yourActionsContainer);

        // Get their actions
        const theirActions = getActionDetails(theirActionsContainer);

        // Get additional notes
        const notes = dealNotesElement.value.trim();

        // Validate that at least one action is defined
        if (yourActions.length === 0 && theirActions.length === 0) {
            showNotification('Please add at least one action to the deal', 'error');
            return;
        }

        // Create the deal object
        const newDeal = {
            id: generateUniqueId(),
            createdAt: new Date().toISOString(),
            proposerId: currentPlayer.id,
            proposerName: currentPlayer.name,
            receiverId: otherPlayerId,
            receiverName: otherPlayer.name,
            lobbyId: currentLobby.id,
            lobbyName: currentLobby.name,
            status: 'pending',
            proposerActions: yourActions,
            receiverActions: theirActions,
            notes: notes,
            summary: dealSummaryElement.textContent
        };

        // Add to deals array
        deals.push(newDeal);

        // Save to localStorage
        saveDeals();

        // Show notification
        showNotification('Deal proposed successfully!', 'success');

        // Clear form
        clearDealForm();

        // Go back to lobby
        ViewManager.showView('lobby-view');
    }

    // Get detailed action data from a container
    function getActionDetails(container) {
        const actionsList = container.querySelector('.actions-list');
        if (!actionsList) return [];

        const actions = [];
        const actionItems = actionsList.querySelectorAll('.action-item');

        actionItems.forEach(item => {
            const actionType = item.querySelector('.action-title').textContent;

            if (actionType === 'Deliver Goods') {
                let goodsType = item.querySelector('.goods-type').value;
                if (goodsType === 'other') {
                    goodsType = item.querySelector('.custom-goods').value || 'goods';
                }

                const quantity = item.querySelector('.goods-quantity').value;
                const destination = item.querySelector('.destination').value || 'the destination';
                const condition = item.querySelector('.delivery-condition').value;

                actions.push({
                    type: 'deliver-goods',
                    goodsType: goodsType,
                    quantity: quantity,
                    destination: destination,
                    condition: condition
                });
            }
            else if (actionType === 'Payment') {
                const amount = item.querySelector('.payment-amount').value;
                const condition = item.querySelector('.payment-condition').value;

                actions.push({
                    type: 'payment',
                    amount: amount,
                    condition: condition
                });
            }
            else if (actionType === 'Track Usage') {
                const usageType = item.querySelector('.track-usage-type').value;
                const times = item.querySelector('.track-usage-times').value;
                let fee = 0;

                if (usageType === 'fee') {
                    fee = item.querySelector('.track-usage-fee').value;
                }

                actions.push({
                    type: 'track-usage',
                    usageType: usageType,
                    times: times,
                    fee: fee
                });
            }
            else if (actionType === 'Custom Action') {
                const text = item.querySelector('.custom-action-text').value || 'Custom action';

                actions.push({
                    type: 'custom-action',
                    text: text
                });
            }
        });

        return actions;
    }

    // Clear the deal creation form
    function clearDealForm() {
        // Clear action containers
        yourActionsContainer.innerHTML = '';
        theirActionsContainer.innerHTML = '';

        // Clear notes
        dealNotesElement.value = '';

        // Clear summary
        dealSummaryElement.textContent = '';
    }

    // Load deals from localStorage
    function loadDeals() {
        const storedDeals = localStorage.getItem('deals');
        if (storedDeals) {
            deals = JSON.parse(storedDeals);
        }
    }

    // Save deals to localStorage
    function saveDeals() {
        localStorage.setItem('deals', JSON.stringify(deals));
    }

    // Refresh deal lists
    function refreshDealLists() {
        const currentPlayer = LobbyManager.getCurrentPlayer();
        if (!currentPlayer) return;

        // Get deals for the current player
        const incomingDeals = deals.filter(deal =>
            deal.receiverId === currentPlayer.id &&
            deal.status === 'pending'
        );

        const outgoingDeals = deals.filter(deal =>
            deal.proposerId === currentPlayer.id &&
            deal.status === 'pending'
        );

        const activeDeals = deals.filter(deal =>
            (deal.proposerId === currentPlayer.id || deal.receiverId === currentPlayer.id) &&
            deal.status === 'accepted'
        );

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

    // Create a deal card element
    function createDealCard(deal) {
        const currentPlayer = LobbyManager.getCurrentPlayer();
        const isProposer = deal.proposerId === currentPlayer.id;
        const otherPlayerName = isProposer ? deal.receiverName : deal.proposerName;

        const dealCard = document.createElement('div');
        dealCard.className = 'deal-card';
        dealCard.setAttribute('data-deal-id', deal.id);

        // Create a summary of the deal for the card
        let shortSummary = '';
        if (deal.proposerActions.length > 0) {
            shortSummary += `${deal.proposerName} will: `;
            shortSummary += deal.proposerActions.map(a => getShortActionText(a)).join(', ');
            shortSummary += '. ';
        }

        if (deal.receiverActions.length > 0) {
            shortSummary += `${deal.receiverName} will: `;
            shortSummary += deal.receiverActions.map(a => getShortActionText(a)).join(', ');
            shortSummary += '.';
        }

        // Truncate if too long
        if (shortSummary.length > 100) {
            shortSummary = shortSummary.substring(0, 100) + '...';
        }

        let statusLabel = '';
        if (deal.status === 'pending') {
            statusLabel = '<span class="deal-status pending">Pending</span>';
        } else if (deal.status === 'accepted') {
            statusLabel = '<span class="deal-status accepted">Active</span>';
        } else if (deal.status === 'rejected') {
            statusLabel = '<span class="deal-status rejected">Rejected</span>';
        } else if (deal.status === 'completed') {
            statusLabel = '<span class="deal-status completed">Completed</span>';
        } else if (deal.status === 'cancelled') {
            statusLabel = '<span class="deal-status cancelled">Cancelled</span>';
        }

        dealCard.innerHTML = `
            <h4>Deal with ${otherPlayerName} ${statusLabel}</h4>
            <p>${shortSummary}</p>
            <p class="deal-date">Proposed: ${formatDate(deal.createdAt)}</p>
        `;

        return dealCard;
    }

    // Get short text description of an action
    function getShortActionText(action) {
        if (action.type === 'deliver-goods') {
            return `deliver ${action.quantity} ${action.goodsType} to ${action.destination}`;
        } else if (action.type === 'payment') {
            return `pay ${action.amount} million`;
        } else if (action.type === 'track-usage') {
            return `allow track usage ${action.times} times`;
        } else if (action.type === 'custom-action') {
            // Truncate custom action text if necessary
            let text = action.text;
            if (text.length > 30) {
                text = text.substring(0, 30) + '...';
            }
            return text;
        }
        return '';
    }

    // View deal details
    function viewDealDetails(dealId) {
        // Find the deal
        const deal = deals.find(d => d.id === dealId);
        if (!deal) return;

        // Store current deal
        currentDeal = deal;

        // Format deal details
        let detailsHtml = `
            <h3>Deal between ${deal.proposerName} and ${deal.receiverName}</h3>
            <p>Status: <strong>${formatStatus(deal.status)}</strong></p>
            <p>Proposed: ${formatDate(deal.createdAt)}</p>
        `;

        if (deal.acceptedAt) {
            detailsHtml += `<p>Accepted: ${formatDate(deal.acceptedAt)}</p>`;
        }

        if (deal.completedAt) {
            detailsHtml += `<p>Completed: ${formatDate(deal.completedAt)}</p>`;
        }

        detailsHtml += '<div class="deal-terms">';

        // Proposer actions
        if (deal.proposerActions.length > 0) {
            detailsHtml += `<h4>${deal.proposerName} will:</h4><ul>`;
            deal.proposerActions.forEach(action => {
                detailsHtml += `<li>${formatAction(action)}</li>`;
            });
            detailsHtml += '</ul>';
        }

        // Receiver actions
        if (deal.receiverActions.length > 0) {
            detailsHtml += `<h4>${deal.receiverName} will:</h4><ul>`;
            deal.receiverActions.forEach(action => {
                detailsHtml += `<li>${formatAction(action)}</li>`;
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
        dealDetailContentElement.innerHTML = detailsHtml;

        // Show/hide appropriate buttons based on deal status and current player
        const currentPlayer = LobbyManager.getCurrentPlayer();
        const isProposer = deal.proposerId === currentPlayer.id;
        const isReceiver = deal.receiverId === currentPlayer.id;

        // Hide all buttons first
        acceptDealBtn.classList.add('hidden');
        rejectDealBtn.classList.add('hidden');
        cancelOfferBtn.classList.add('hidden');
        completeDealBtn.classList.add('hidden');

        // Show relevant buttons
        if (deal.status === 'pending') {
            if (isReceiver) {
                acceptDealBtn.classList.remove('hidden');
                rejectDealBtn.classList.remove('hidden');
            }
            if (isProposer) {
                cancelOfferBtn.classList.remove('hidden');
            }
        } else if (deal.status === 'accepted') {
            if (isProposer || isReceiver) {
                completeDealBtn.classList.remove('hidden');
            }
        }

        // Show deal detail view
        ViewManager.showView('deal-detail-view');
    }

    // Format action for display
    function formatAction(action) {
        if (action.type === 'deliver-goods') {
            let text = `Deliver ${action.quantity} ${action.goodsType} to ${action.destination}`;
            if (action.condition === 'leave') {
                text += ' and leave them there';
            } else {
                text += ' for pickup';
            }
            return text;
        } else if (action.type === 'payment') {
            let text = `Pay ${action.amount} million`;
            if (action.condition === 'upfront') {
                text += ' upfront';
            } else if (action.condition === 'on-completion') {
                text += ' on completion';
            } else if (action.condition === 'on-pickup') {
                text += ' on pickup';
            }
            return text;
        } else if (action.type === 'track-usage') {
            let text = `Allow track usage ${action.times} times`;
            if (action.usageType === 'free') {
                text += ' for free';
            } else {
                text += ` for a fee of ${action.fee} million each time`;
            }
            return text;
        } else if (action.type === 'custom-action') {
            return action.text;
        }
        return '';
    }

    // Format status for display
    function formatStatus(status) {
        switch (status) {
            case 'pending': return 'Pending Approval';
            case 'accepted': return 'Active';
            case 'rejected': return 'Rejected';
            case 'completed': return 'Completed';
            case 'cancelled': return 'Cancelled';
            default: return status;
        }
    }

    // Format date for display
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    // Accept a deal
    function acceptDeal() {
        if (!currentDeal) return;

        // Update deal status
        currentDeal.status = 'accepted';
        currentDeal.acceptedAt = new Date().toISOString();

        // Save deals
        saveDeals();

        // Show notification
        showNotification('Deal accepted!', 'success');

        // Refresh deal lists
        refreshDealLists();

        // Go back to deals view
        ViewManager.showView('active-deals-view');
    }

    // Reject a deal
    function rejectDeal() {
        if (!currentDeal) return;

        // Update deal status
        currentDeal.status = 'rejected';
        currentDeal.rejectedAt = new Date().toISOString();

        // Save deals
        saveDeals();

        // Show notification
        showNotification('Deal rejected', 'error');

        // Refresh deal lists
        refreshDealLists();

        // Go back to deals view
        ViewManager.showView('deal-offers-view');
    }

    // Cancel an offer
    function cancelOffer() {
        if (!currentDeal) return;

        // Update deal status
        currentDeal.status = 'cancelled';
        currentDeal.cancelledAt = new Date().toISOString();

        // Save deals
        saveDeals();

        // Show notification
        showNotification('Deal offer cancelled', 'error');

        // Refresh deal lists
        refreshDealLists();

        // Go back to deals view
        ViewManager.showView('deal-offers-view');
    }

    // Mark a deal as completed
    function completeDeal() {
        if (!currentDeal) return;

        // Update deal status
        currentDeal.status = 'completed';
        currentDeal.completedAt = new Date().toISOString();

        // Save deals
        saveDeals();

        // Show notification
        showNotification('Deal marked as completed!', 'success');

        // Refresh deal lists
        refreshDealLists();

        // Go back to active deals view
        ViewManager.showView('active-deals-view');
    }

    // Initialize the deal player selection dropdown
    function initDealPlayerSelect() {
        // Clear existing options
        dealWithSelect.innerHTML = '';

        // Get lobby players
        const players = LobbyManager.getPlayers();
        const currentPlayer = LobbyManager.getCurrentPlayer();

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
        updateDealSummary();
    }

    // Generate a unique ID
    function generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // Public methods
    return {
        init,
        refreshDealLists,
        initDealPlayerSelect,
        clearDealForm
    };
})();

// Initialize deal functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    DealManager.init();
});
