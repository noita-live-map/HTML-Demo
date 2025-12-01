// Configuration
const CONFIG = {
    editMode: true,
    selectedColor: '#ff0000',
    markers: [],
    minZoom: 0.01,
    maxZoom: 20
};

const STORAGE_KEY = 'noitaMapMarkers';

// Game coordinate ranges
const mapXRange = [-9999, 9999];
const mapYRange = [-9999, 9999];

// Static pre-defined markers
const staticMarkers = [
    { gameX: 1000, gameY: 1000, color: '#35c9d3', name: 'test', gameCoords: true }
];

function positionImageInBounds(imgElement, gameX, gameY) {
    const imgX = gameX - mapXRange[0];
    const imgY = gameY - mapYRange[0];
    
    imgElement.style.position = 'absolute';
    imgElement.style.left = `${imgX}px`;
    imgElement.style.top = `${imgY}px`;
    
    return imgElement;
}

// Transform state
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let dragStartX = 0;
let dragStartY = 0;

// DOM Elements
const mapImage = document.getElementById('map-image');
const mapContainer = document.getElementById('map-container');
const mapWrapper = document.getElementById('map-wrapper');
const markersLayer = document.getElementById('markers-layer');
const coordinateDisplay = document.getElementById('coordinate-display');
const colorButtons = document.querySelectorAll('.color-btn');
const clearMarkersBtn = document.getElementById('clear-markers');
const toggleEditBtn = document.getElementById('toggle-edit');
const imageInput = document.getElementById('image-input');
const zoomResetBtn = document.getElementById('zoom-reset');

let mapImageLoaded = false;
let markerIdCounter = 0;

// Initialize
function init() {
    loadMarkers();
    setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
    // Color picker buttons
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            CONFIG.selectedColor = btn.dataset.color;
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
        CONFIG.editMode = !CONFIG.editMode;
        toggleEditBtn.textContent = CONFIG.editMode ? 'Edit Mode' : 'Drag Mode';
        mapContainer.style.cursor = CONFIG.editMode ? 'crosshair' : 'grab';
        coordinateDisplay.style.display = CONFIG.editMode ? 'block' : 'none';
    });
    
    // Image file input
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadImageFromFile(file);
        }
    });
    
    // Zoom controls
    zoomResetBtn.addEventListener('click', centerMap);
    
    // Keyboard shortcuts for zoom
    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        
        const centerX = mapContainer.clientWidth / 2;
        const centerY = mapContainer.clientHeight / 2;
        
        if (e.key === '=' || e.key === '+') {
            e.preventDefault();
            zoomAtPoint(centerX, centerY, 1.1);
        } else if (e.key === '-') {
            e.preventDefault();
            zoomAtPoint(centerX, centerY, 0.9);
        } else if (e.key === '0') {
            e.preventDefault();
            centerMap();
        }
    });
    
    // Mouse wheel zoom
    mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        zoomAtPoint(mouseX, mouseY, delta);
    }, { passive: false });
    
    // Drag to pan
    mapContainer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('marker')) return;
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        mapContainer.classList.add('grabbing');
    });
    
    mapContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
    });
    
    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            const dragDistance = Math.sqrt(
                Math.pow(e.clientX - dragStartX, 2) + 
                Math.pow(e.clientY - dragStartY, 2)
            );
            
            if (dragDistance < 5 && CONFIG.editMode && e.target === mapImage) {
                handleMapClick(e);
            }
        }
        isDragging = false;
        mapContainer.classList.remove('grabbing');
    });
    
    // Handle image load
    mapImage.addEventListener('load', () => {
        mapImageLoaded = true;
        updateMarkerLayerSize();
        centerMap();
        renderAllMarkers();
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        if (mapImageLoaded) {
            updateMarkerLayerSize();
        }
    });
    
    mapContainer.addEventListener('mousemove', (e) => {
        if (CONFIG.editMode && mapImageLoaded) {
            updateCoordinateDisplay(e);
        }
    });
    
    mapContainer.addEventListener('mouseleave', () => {
        coordinateDisplay.style.display = 'none';
    });
    
    mapContainer.addEventListener('mouseenter', () => {
        if (CONFIG.editMode) {
            coordinateDisplay.style.display = 'block';
        }
    });
}

// Image Loading
function loadImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        mapImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Transform Functions
function updateTransform() {
    mapWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    
    const markerScale = 1 / scale;
    document.querySelectorAll('.marker').forEach(marker => {
        marker.style.transform = `translate(-50%, -50%) scale(${markerScale})`;
    });
}

function zoomAtPoint(mouseX, mouseY, delta) {
    const newScale = Math.min(Math.max(CONFIG.minZoom, scale * delta), CONFIG.maxZoom);
    const scaleChange = newScale / scale;
    
    translateX = mouseX - (mouseX - translateX) * scaleChange;
    translateY = mouseY - (mouseY - translateY) * scaleChange;
    
    scale = newScale;
    updateTransform();
}

function centerMap() {
    if (!mapImageLoaded) return;
    
    const containerRect = mapContainer.getBoundingClientRect();
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    const scaleX = (containerRect.width * 0.9) / imgWidth;
    const scaleY = (containerRect.height * 0.9) / imgHeight;
    scale = Math.min(scaleX, scaleY, 1);
    
    translateX = (containerRect.width - imgWidth * scale) / 2;
    translateY = (containerRect.height - imgHeight * scale) / 2;
    
    updateTransform();
    updateMarkerLayerSize();
}

// Coordinate Display
function updateCoordinateDisplay(e) {
    if (!mapImageLoaded) return;
    
    const rect = mapContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert to image coordinates
    const imgX = (mouseX - translateX) / scale;
    const imgY = (mouseY - translateY) / scale;
    
    // Get image dimensions for Y inversion
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    const gameX = imgX + mapXRange[0];
    const gameY = (imgHeight - imgY) + mapYRange[0];
    
    coordinateDisplay.style.left = `${e.clientX + 15}px`;
    coordinateDisplay.style.top = `${e.clientY + 15}px`;
    coordinateDisplay.textContent = `(${Math.round(gameX)}, ${Math.round(gameY)})`;
}

// Marker Management
function handleMapClick(e) {
    if (!CONFIG.editMode || !mapImageLoaded) return;
    
    const rect = mapContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const imgX = (clickX - translateX) / scale;
    const imgY = (clickY - translateY) / scale;
    
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    if (imgX < 0 || imgX > imgWidth || imgY < 0 || imgY > imgHeight) {
        return;
    }
    
    // Convert image coordinates to game coordinates
    const gameX = imgX + mapXRange[0];
    const gameY = (imgHeight - imgY) + mapYRange[0];
    
    placeMarker(gameX, gameY, CONFIG.selectedColor);
}

function placeMarker(gameX, gameY, color) {
    const marker = {
        id: ++markerIdCounter,
        gameX: gameX,
        gameY: gameY,
        color: color,
        gameCoords: true
    };
    
    CONFIG.markers.push(marker);
    renderMarker(marker);
    saveMarkers();
}

function renderMarker(marker, isStatic = false) {
    if (!mapImageLoaded) return;
    
    let imgX, imgY;
    if (marker.gameCoords && marker.gameX !== undefined && marker.gameY !== undefined) {
        const imgHeight = mapImage.naturalHeight;
        imgX = marker.gameX - mapXRange[0];
        imgY = imgHeight - (marker.gameY - mapYRange[0]);
    } else {
        // Fallback for old markers stored with image coordinates
        imgX = marker.imgX || 0;
        imgY = marker.imgY || 0;
    }
    
    const markerElement = document.createElement('div');
    markerElement.className = isStatic ? 'marker static-marker' : 'marker';
    markerElement.dataset.markerId = marker.id;
    markerElement.dataset.isStatic = isStatic;
    markerElement.style.backgroundColor = getColorValue(marker.color);
    markerElement.style.color = getColorValue(marker.color);
    markerElement.style.left = `${imgX}px`;
    markerElement.style.top = `${imgY}px`;
    markerElement.style.transform = `translate(-50%, -50%) scale(${1 / scale})`;
    
    if (marker.name) {
        markerElement.title = marker.name;
    }
    
    if (!isStatic) {
        markerElement.addEventListener('click', (e) => {
            if (CONFIG.editMode) {
                e.stopPropagation();
                removeMarker(marker.id);
            }
        });
    }
    
    markersLayer.appendChild(markerElement);
}

function updateMarkerLayerSize() {
    if (!mapImageLoaded) return;
    
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    markersLayer.style.width = `${imgWidth}px`;
    markersLayer.style.height = `${imgHeight}px`;
    
    document.querySelectorAll('.marker').forEach(marker => {
        marker.style.transform = `translate(-50%, -50%) scale(${1 / scale})`;
    });
}

function removeMarker(markerId) {
    const marker = CONFIG.markers.find(m => m.id === markerId);
    if (marker && marker.static) return;
    
    CONFIG.markers = CONFIG.markers.filter(m => m.id !== markerId);
    const markerElement = markersLayer.querySelector(`[data-marker-id="${markerId}"]`);
    if (markerElement && !markerElement.dataset.isStatic) {
        markerElement.remove();
    }
    saveMarkers();
}

function clearAllMarkers() {
    CONFIG.markers = CONFIG.markers.filter(m => m.static);
    markersLayer.innerHTML = '';
    renderAllMarkers();
    saveMarkers();
}

function renderAllMarkers() {
    if (!mapImageLoaded) return;
    
    staticMarkers.forEach((marker, index) => {
        renderMarker({ ...marker, id: `static-${index}`, static: true }, true);
    });
    
    CONFIG.markers.forEach(marker => {
        if (!marker.static) {
            renderMarker(marker, false);
        }
    });
}

function getColorValue(hexColor) {
    if (hexColor && hexColor.startsWith('#')) {
        return hexColor;
    }
    return '#ff0000';
}

// LocalStorage
function saveMarkers() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG.markers));
    } catch (error) {
        console.error('Error saving markers:', error);
    }
}

function loadMarkers() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            CONFIG.markers = JSON.parse(saved);
            if (CONFIG.markers.length > 0) {
                markerIdCounter = Math.max(...CONFIG.markers.map(m => m.id || 0));
            }
        }
    } catch (error) {
        console.error('Error loading markers:', error);
    }
}

// Initialize
init();
