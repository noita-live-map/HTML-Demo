// Configuration
let config = {
    editMode: true,
    selectedColor: 'red',
    markers: [],
    zoomLevel: 100, // Percentage
    minZoom: 25,
    maxZoom: 500
};

// DOM Elements
const mapImage = document.getElementById('map-image');
const mapContainer = document.getElementById('map-container');
const markersLayer = document.getElementById('markers-layer');
const colorButtons = document.querySelectorAll('.color-btn');
const clearMarkersBtn = document.getElementById('clear-markers');
const toggleEditBtn = document.getElementById('toggle-edit');
const imageInput = document.getElementById('image-input');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLevelSpan = document.getElementById('zoom-level');

let mapImageLoaded = false;

// Initialize
function init() {
    // Load saved markers from localStorage
    loadMarkers();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update zoom display
    updateZoomDisplay();
}

// Event Listeners
function setupEventListeners() {
    // Color picker buttons
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            config.selectedColor = btn.dataset.color;
        });
    });
    
    // Clear markers button
    clearMarkersBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all markers?')) {
            clearAllMarkers();
        }
    });
    
    // Toggle edit mode
    toggleEditBtn.addEventListener('click', () => {
        config.editMode = !config.editMode;
        toggleEditBtn.textContent = `Edit Mode: ${config.editMode ? 'ON' : 'OFF'}`;
        mapContainer.style.cursor = config.editMode ? 'crosshair' : 'default';
    });
    
    // Image file input
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadImageFromFile(file);
        }
    });
    
    // Zoom controls
    zoomInBtn.addEventListener('click', () => {
        zoomIn();
    });
    
    zoomOutBtn.addEventListener('click', () => {
        zoomOut();
    });
    
    zoomResetBtn.addEventListener('click', () => {
        resetZoom();
    });
    
    // Keyboard shortcuts for zoom
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                resetZoom();
            }
        }
    });
    
    // Mouse wheel zoom
    mapContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    });
    
    // Map click handler for placing markers
    mapContainer.addEventListener('click', (e) => {
        if (!config.editMode || !mapImageLoaded) return;
        
        const rect = mapImage.getBoundingClientRect();
        
        // Get click position relative to viewport
        const clickX = e.clientX;
        const clickY = e.clientY;
        
        // Check if click is within the image bounds
        if (clickX < rect.left || clickX > rect.right || 
            clickY < rect.top || clickY > rect.bottom) {
            return;
        }
        
        // Calculate relative position on the image (0 to 1)
        const imgX = (clickX - rect.left) / rect.width;
        const imgY = (clickY - rect.top) / rect.height;
        
        // Place marker
        placeMarker(imgX, imgY, config.selectedColor);
    });
    
    // Handle image load to update marker positions
    mapImage.addEventListener('load', () => {
        mapImageLoaded = true;
        setTimeout(updateMarkerPositions, 50);
    });
}

// Image Loading
function loadImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        mapImage.src = e.target.result;
        // Reset zoom when loading new image
        resetZoom();
    };
    reader.readAsDataURL(file);
}

// Zoom Functions
function zoomIn() {
    if (config.zoomLevel < config.maxZoom) {
        config.zoomLevel = Math.min(config.zoomLevel + 25, config.maxZoom);
        applyZoom();
    }
}

function zoomOut() {
    if (config.zoomLevel > config.minZoom) {
        config.zoomLevel = Math.max(config.zoomLevel - 25, config.minZoom);
        applyZoom();
    }
}

function resetZoom() {
    config.zoomLevel = 100;
    applyZoom();
}

function applyZoom() {
    if (mapImageLoaded) {
        mapImage.style.width = `${config.zoomLevel}%`;
        mapImage.style.height = 'auto';
        updateZoomDisplay();
        setTimeout(updateMarkerPositions, 50);
    }
}

function updateZoomDisplay() {
    zoomLevelSpan.textContent = `${config.zoomLevel}%`;
}

// Marker Management
function placeMarker(x, y, color) {
    const marker = {
        id: Date.now() + Math.random(),
        x: x,
        y: y,
        color: color
    };
    
    config.markers.push(marker);
    renderMarker(marker);
    saveMarkers();
}

function renderMarker(marker) {
    const markerElement = document.createElement('div');
    markerElement.className = 'marker';
    markerElement.dataset.markerId = marker.id;
    markerElement.style.backgroundColor = getColorValue(marker.color);
    markerElement.style.color = getColorValue(marker.color);
    
    // Position will be set by updateMarkerPositions
    markerElement.style.left = `${marker.x * 100}%`;
    markerElement.style.top = `${marker.y * 100}%`;
    
    // Add click handler to remove marker
    markerElement.addEventListener('click', (e) => {
        if (config.editMode) {
            e.stopPropagation();
            removeMarker(marker.id);
        }
    });
    
    markersLayer.appendChild(markerElement);
}

function updateMarkerPositions() {
    if (!mapImageLoaded) return;
    
    const rect = mapImage.getBoundingClientRect();
    const containerRect = mapContainer.getBoundingClientRect();
    
    // Calculate image position relative to container
    const imgLeft = rect.left - containerRect.left + mapContainer.scrollLeft;
    const imgTop = rect.top - containerRect.top + mapContainer.scrollTop;
    
    // Update markers layer size and position to match image
    markersLayer.style.width = `${rect.width}px`;
    markersLayer.style.height = `${rect.height}px`;
    markersLayer.style.left = `${imgLeft}px`;
    markersLayer.style.top = `${imgTop}px`;
    
    // Update marker positions (using percentage for relative positioning)
    const markers = markersLayer.querySelectorAll('.marker');
    markers.forEach(markerEl => {
        const markerId = markerEl.dataset.markerId;
        const marker = config.markers.find(m => m.id.toString() === markerId);
        if (marker) {
            markerEl.style.left = `${marker.x * 100}%`;
            markerEl.style.top = `${marker.y * 100}%`;
        }
    });
}

function removeMarker(markerId) {
    config.markers = config.markers.filter(m => m.id !== markerId);
    const markerElement = markersLayer.querySelector(`[data-marker-id="${markerId}"]`);
    if (markerElement) {
        markerElement.remove();
    }
    saveMarkers();
}

function clearAllMarkers() {
    config.markers = [];
    markersLayer.innerHTML = '';
    saveMarkers();
}

function getColorValue(colorName) {
    const colors = {
        red: '#ff0000',
        orange: '#ff8800',
        yellow: '#ffdd00',
        green: '#00ff00',
        blue: '#0088ff',
        purple: '#aa00ff',
        pink: '#ff00aa',
        cyan: '#00ffff'
    };
    return colors[colorName] || colors.red;
}

// LocalStorage for markers persistence
function saveMarkers() {
    try {
        localStorage.setItem('noitaMapMarkers', JSON.stringify(config.markers));
    } catch (error) {
        console.error('Error saving markers:', error);
    }
}

function loadMarkers() {
    try {
        const saved = localStorage.getItem('noitaMapMarkers');
        if (saved) {
            config.markers = JSON.parse(saved);
            config.markers.forEach(marker => renderMarker(marker));
        }
    } catch (error) {
        console.error('Error loading markers:', error);
    }
}

// Handle window resize to update marker positions
window.addEventListener('resize', () => {
    setTimeout(updateMarkerPositions, 100);
});

// Handle scroll to keep markers aligned
mapContainer.addEventListener('scroll', () => {
    updateMarkerPositions();
});

// Initialize on page load
init();
