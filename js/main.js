/*
 * main.js - Core functionality for EuroRails Deal Tracker
 */

// View management system
const ViewManager = (function() {
    // All view IDs
    const views = [
        'landing-view',
        'lobby-view',
        'deal-creation-view',
        'deal-offers-view',
        'active-deals-view',
        'deal-detail-view'
    ];

    // Current and previous views
    let currentView = 'landing-view';
    let previousView = null;

    // Show a specific view
    function showView(viewId) {
        // Validate view ID
        if (!views.includes(viewId)) {
            console.error(`Invalid view ID: ${viewId}`);
            return;
        }

        // Handle special cases before view switch
        if (viewId === 'deal-creation-view') {
            // Initialize player select dropdown
            DealManager.initDealPlayerSelect();
            DealManager.clearDealForm();
        }

        if (viewId === 'active-deals-view') {
            // Refresh deal lists
            DealManager.refreshDealLists();
        }

        // Store previous view
        previousView = currentView;

        // Hide all views
        views.forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        // Show selected view
        document.getElementById(viewId).classList.remove('hidden');

        // Update current view
        currentView = viewId;
    }

    // Get current view ID
    function getCurrentView() {
        return currentView;
    }

    // Get previous view ID
    function getPreviousView() {
        return previousView;
    }

    // Public methods
    return {
        showView,
        getCurrentView,
        getPreviousView
    };
})();

// Show a notification message
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');

    // Set message
    notification.textContent = message;

    // Set type class
    notification.className = 'notification';
    notification.classList.add(type);

    // Show notification
    notification.classList.add('show');

    // Hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Add notification element if not present
function ensureNotificationElement() {
    let notification = document.getElementById('notification');

    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification hidden';
        document.body.appendChild(notification);
    }
}

// Initialize application
function initializeApp() {
    ensureNotificationElement();

    // Check if localStorage is available
    if (typeof localStorage === 'undefined') {
        showNotification('Your browser does not support local storage. Some features may not work properly.', 'error');
    }

    // Initialize localStorage structure if needed
    if (!localStorage.getItem('lobbies')) {
        localStorage.setItem('lobbies', JSON.stringify([]));
    }

    if (!localStorage.getItem('deals')) {
        localStorage.setItem('deals', JSON.stringify([]));
    }

    // Start with landing view
    ViewManager.showView('landing-view');
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});