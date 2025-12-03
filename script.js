// Configuration
const CONFIG = {
    editMode: true,
    selectedColor: '#ff0000',
    markers: [],
    minZoom: 0.01,
    maxZoom: 20,
    backendEnabled: false,
    backendUrl: 'https://noita-map-prod-gfazede8d3embzde.canadacentral-01.azurewebsites.net',
    refreshInterval: 5000 // 5 seconds
};

const STORAGE_KEY = 'noitaMapMarkers';

// Backend API configuration
let GAME_ID = null;
let refreshIntervalId = null;

// Game coordinate ranges
const mapXRange = [-4096, 4096];
const mapYRange = [-2048, 14336];

// Static pre-defined markers
const staticMarkers = [
    // Bosses
    { gameX: 2346, gameY: 7443, color: '#d65930', name: 'Suomuhuaki (Dragon)', gameCoords: true },
    { gameX: 4168, gameY: 888, color: '#35c9d3', name: 'Sauvojen tuntija (Connoisseur of Wands)', gameCoords: true },
    { gameX: -4841, gameY: 850, color: '#35c9d3', name: 'Ylialkemisti (High Alchemist)', gameCoords: true },
    { gameX: 3555, gameY: 13025, color: '#35c9d3', name: 'Veska, Molari, Mokke, Seula (Gate Guardian)', gameCoords: true },
    { gameX: 3555, gameY: 13025, color: '#35c9d3', name: 'Kolmisilmä (Three-Eye)', gameCoords: true },

    // Orbs
    { gameX: 768, gameY: -1280, icon: 'icons/orb_0.png', name: 'Orb 0 - Sea of Lava', gameCoords: true },
    { gameX: 3328, gameY: 1792, icon: 'icons/orb_3.png', name: 'Orb 3 - Nuke', gameCoords: true },
    { gameX: -4352, gameY: 3840, icon: 'icons/orb_5.png', name: 'Orb 5 - Holy Bomb', gameCoords: true },
    { gameX: -3840, gameY: 9984, icon: 'icons/orb_6.png', name: 'Orb 6 - Spiral Shot', gameCoords: true },
    { gameX: 4352, gameY: 768, icon: 'icons/orb_7.png', name: 'Orb 7 - Thundercloud', gameCoords: true },
    { gameX: -256, gameY: 16128, icon: 'icons/orb_8.png', name: 'Orb 8 - Fireworks!', gameCoords: true },
];

// View transform state
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;

// DOM Elements
const mapImage = document.getElementById('map-image');
const mapContainer = document.getElementById('map-container');
const mapWrapper = document.getElementById('map-wrapper');
const markersLayer = document.getElementById('markers-layer');
const playerOverlay = document.getElementById('player-overlay');
const coordinateDisplay = document.getElementById('coordinate-display');
const colorButtons = document.querySelectorAll('.color-btn');
const clearMarkersBtn = document.getElementById('clear-markers');
const toggleEditBtn = document.getElementById('toggle-edit');
const zoomResetBtn = document.getElementById('zoom-reset');
const toggleBackendBtn = document.getElementById('toggle-backend');
const gameIdInput = document.getElementById('game-id-input');

let mapImageLoaded = false;
let markerIdCounter = 0;
let playerMarker = null;
let isFirstImageLoad = true;

// Coordinate conversion utilities
function gameToImageCoords(gameX, gameY, imgHeight) {
    const imgX = gameX - mapXRange[0];
    const imgY = imgHeight - (gameY - mapYRange[0]);
    return [imgX, imgY];
}

function imageToGameCoords(imgX, imgY, imgHeight) {
    const gameX = imgX + mapXRange[0];
    const gameY = (imgHeight - imgY) + mapYRange[0];
    return [gameX, gameY];
}

function screenToImageCoords(screenX, screenY) {
    const imgX = (screenX - translateX) / scale;
    const imgY = (screenY - translateY) / scale;
    return [imgX, imgY];
}

// Initialize
function init() {
    // Get game_id from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    GAME_ID = urlParams.get('game_id') || '';
    
    loadMarkers();
    setupEventListeners();
    
    if (gameIdInput) {
        gameIdInput.value = GAME_ID;
        gameIdInput.placeholder = 'Enter valid game_id';
    }
    
    if (!GAME_ID) {
        console.warn('⚠️ No game_id provided. Set it via URL ?game_id=YOUR_ID or in the input field');
    }
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
    
    // Zoom controls
    zoomResetBtn.addEventListener('click', centerMap);
    
    // Backend integration controls
    if (toggleBackendBtn) {
        toggleBackendBtn.addEventListener('click', async () => {
            CONFIG.backendEnabled = !CONFIG.backendEnabled;
            toggleBackendBtn.textContent = CONFIG.backendEnabled ? 'Disable Backend' : 'Enable Backend';
            if (CONFIG.backendEnabled) {
                console.log('Backend enabled, testing connection...');
                const connected = await testBackendConnection();
                if (connected) {
                    startBackendRefresh();
                    // Do immediate fetch instead of waiting for interval
                    try {
                        await updatePlayerPosition();
                        await updateMapTerrain();
                    } catch (error) {
                        console.error('Initial backend fetch failed:', error);
                    }
                } else {
                    // Disable backend if connection test fails
                    CONFIG.backendEnabled = false;
                    toggleBackendBtn.textContent = 'Enable Backend';
                    console.warn('Backend disabled due to connection failure');
                }
            } else {
                stopBackendRefresh();
            }
        });
    }
    
    if (gameIdInput) {
        gameIdInput.addEventListener('change', (e) => {
            GAME_ID = e.target.value || '12345678';
            if (CONFIG.backendEnabled) {
                stopBackendRefresh();
                startBackendRefresh();
            }
        });
    }
    
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
        dragOffsetX = e.clientX - translateX;
        dragOffsetY = e.clientY - translateY;
        mapContainer.classList.add('grabbing');
    });
    
    mapContainer.addEventListener('mousemove', (e) => {
        if (isDragging) {
            translateX = e.clientX - dragOffsetX;
            translateY = e.clientY - dragOffsetY;
            updateTransform();
        } else if (CONFIG.editMode && mapImageLoaded) {
            updateCoordinateDisplay(e);
        }
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
    
    // Handle image load - only center on first load
    mapImage.addEventListener('load', () => {
        mapImageLoaded = true;
        updateMarkerLayerSize();
        
        if (isFirstImageLoad) {
            centerMap();
            isFirstImageLoad = false;
        }
        
        renderAllMarkers();
        createPlayerMarker();
        
        // Start backend refresh if enabled (in case it wasn't started yet)
        if (CONFIG.backendEnabled && !refreshIntervalId) {
            startBackendRefresh();
        }
    });
    
    // Note: Initial image load from backend happens when backend is enabled via button
    
    // Window resize
    window.addEventListener('resize', () => {
        if (mapImageLoaded) {
            updateMarkerLayerSize();
        }
    });
    
    // Coordinate display
    mapContainer.addEventListener('mouseleave', () => {
        coordinateDisplay.style.display = 'none';
    });
    
    mapContainer.addEventListener('mouseenter', () => {
        if (CONFIG.editMode) {
            coordinateDisplay.style.display = 'block';
        }
    });
}

// Transform functions
function updateTransform() {
    mapWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    updateMarkerTransforms();
}

function updateMarkerTransforms() {
    const markerScale = 1 / scale;
    const transform = `translate(-50%, -50%) scale(${markerScale})`;
    
    document.querySelectorAll('.marker').forEach(marker => {
        marker.style.transform = transform;
    });
    
    if (playerMarker) {
        playerMarker.style.transform = transform;
    }
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

// Coordinate display
function updateCoordinateDisplay(e) {
    if (!mapImageLoaded) return;
    
    const rect = mapContainer.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const [imgX, imgY] = screenToImageCoords(screenX, screenY);
    const [gameX, gameY] = imageToGameCoords(imgX, imgY, mapImage.naturalHeight);
    
    coordinateDisplay.style.left = `${e.clientX + 15}px`;
    coordinateDisplay.style.top = `${e.clientY + 15}px`;
    coordinateDisplay.textContent = `(${Math.round(gameX)}, ${Math.round(gameY)})`;
}

// Marker management
function handleMapClick(e) {
    if (!CONFIG.editMode || !mapImageLoaded) return;
    
    const rect = mapContainer.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const [imgX, imgY] = screenToImageCoords(screenX, screenY);
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    if (imgX < 0 || imgX > imgWidth || imgY < 0 || imgY > imgHeight) {
        return;
    }
    
    const [gameX, gameY] = imageToGameCoords(imgX, imgY, imgHeight);
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
        [imgX, imgY] = gameToImageCoords(marker.gameX, marker.gameY, mapImage.naturalHeight);
    } else {
        // Fallback for old markers stored with image coordinates
        imgX = marker.imgX || 0;
        imgY = marker.imgY || 0;
    }
    
    const markerElement = document.createElement('div');
    markerElement.className = isStatic ? 'marker static-marker' : 'marker';
    markerElement.dataset.markerId = marker.id;
    markerElement.dataset.isStatic = isStatic;
    markerElement.style.left = `${imgX}px`;
    markerElement.style.top = `${imgY}px`;
    markerElement.style.transform = `translate(-50%, -50%) scale(${1 / scale})`;
    
    if (marker.icon) {
        markerElement.classList.add('icon-marker');
        const iconImg = document.createElement('img');
        iconImg.src = marker.icon;
        iconImg.alt = marker.name || 'Marker';
        iconImg.style.width = '100%';
        iconImg.style.height = '100%';
        iconImg.style.objectFit = 'contain';
        markerElement.appendChild(iconImg);
    } else {
        markerElement.style.backgroundColor = getColorValue(marker.color);
        markerElement.style.color = getColorValue(marker.color);
    }
    
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
    updatePlayerOverlaySize();
    updateMarkerTransforms();
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
                markerIdCounter = Math.max(...CONFIG.markers.map(m => m.id || 0), 0);
            }
        }
    } catch (error) {
        console.error('Error loading markers:', error);
    }
}

// Backend API functions
async function testBackendConnection() {
    try {
        const testUrl = `${CONFIG.backendUrl}/info?game_id=${GAME_ID || 'test'}`;
        console.log(`Testing backend connection to: ${CONFIG.backendUrl}...`);
        
        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(testUrl, { 
            method: 'GET',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log('✅ Backend server is reachable!');
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Connection timeout - server may be slow or unreachable');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.error('❌ Backend server connection failed!');
            console.error(`   Server URL: ${CONFIG.backendUrl}`);
            console.error('   Make sure your Flask/Python backend server is running');
            console.error('   Example: python app.py or flask run');
        } else {
            console.error('❌ Connection error:', error.message);
        }
        return false;
    }
}

function startBackendRefresh() {
    stopBackendRefresh();
    
    if (!GAME_ID) {
        console.warn('No game_id set, cannot start backend refresh');
        return;
    }
    
    console.log(`Starting backend refresh for game_id: ${GAME_ID}, URL: ${CONFIG.backendUrl}`);
    
    refreshIntervalId = setInterval(async () => {
        try {
            await updatePlayerPosition();
            await updateMapTerrain();
        } catch (error) {
            console.error('Error refreshing backend data:', error);
        }
    }, CONFIG.refreshInterval);
}

function stopBackendRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
}

async function updatePlayerPosition() {
    if (!CONFIG.backendEnabled || !GAME_ID) {
        if (!GAME_ID) {
            console.warn('⚠️ No game_id set - cannot fetch player position');
        }
        return;
    }
    
    const url = `${CONFIG.backendUrl}/info?game_id=${GAME_ID}`;
    
    try {
        console.log(`Fetching player position from: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            // Try to get error message from response
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData.message || errorData.error) {
                    errorMessage = errorData.message || errorData.error;
                }
            } catch (e) {
                // Not JSON, that's okay
            }
            
            if (response.status === 404 || errorMessage.toLowerCase().includes('not found')) {
                console.error(`❌ Game ID "${GAME_ID}" not found in the database!`);
                console.error('   Please use a valid game_id that exists in your backend');
            } else {
                throw new Error(errorMessage);
            }
            return;
        }
        
        const data = await response.json();
        console.log('Player position data received:', data);
        
        if (data.x !== undefined && data.y !== undefined) {
            updatePlayerMarkerPosition(data.x, data.y);
        } else {
            console.warn('Player position data missing x or y:', data);
        }
    } catch (error) {
        console.error('Error fetching player position:', error);
        console.error('URL attempted:', url);
        
        // Provide specific error messages
        if (error.name === 'TypeError') {
            if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
                console.error('❌ Connection refused - Backend server is not running!');
                console.error(`   Make sure your backend server is running on ${CONFIG.backendUrl}`);
                console.error('   Common causes:');
                console.error('   - Server not started');
                console.error('   - Server running on different port');
                console.error('   - Firewall blocking connection');
            } else {
                console.error('Network error:', error.message);
            }
        } else {
            console.error('Error details:', error);
        }
    }
}

async function updateMapTerrain() {
    if (!CONFIG.backendEnabled || !GAME_ID) return;
    
    // Allow terrain update even if image hasn't loaded yet (for initial load)
    const timestamp = new Date().getTime();
    const newImageSrc = `${CONFIG.backendUrl}/terrain?game_id=${GAME_ID}&time=${timestamp}`;
    
    // Only update if source is different to avoid unnecessary reloads
    if (mapImage.src !== newImageSrc) {
        console.log(`Updating terrain image from: ${newImageSrc}`);
        
        // Set up one-time error handler before changing src
        const errorHandler = () => {
            console.error('❌ Failed to load terrain image from backend!');
            console.error(`   URL: ${newImageSrc}`);
            console.error('   Check the Network tab - the server returned 400 Bad Request');
            console.error('');
            console.error('   Common causes:');
            console.error(`   - Game ID "${GAME_ID}" not found in the database`);
            console.error('   - Invalid game_id format');
            console.error('   - Wrong endpoint path');
            console.error('');
            console.error('   Solution: Use a valid game_id that exists in your backend database');
            mapImage.removeEventListener('error', errorHandler);
        };
        
        const loadHandler = () => {
            console.log('✅ Terrain image loaded successfully');
            mapImage.removeEventListener('load', loadHandler);
        };
        
        // Add event listeners (one-time)
        mapImage.addEventListener('error', errorHandler, { once: true });
        mapImage.addEventListener('load', loadHandler, { once: true });
        
        // Set the image source directly - no fetch() needed
        // Browsers can load images cross-origin without CORS for display
        mapImage.src = newImageSrc;
    }
}

function createPlayerMarker() {
    if (!mapImageLoaded || playerMarker || !playerOverlay) return;
    
    playerOverlay.innerHTML = '';
    const markerEl = document.createElement('div');
    markerEl.className = 'marker player-marker';
    markerEl.style.left = '0px';
    markerEl.style.top = '0px';
    markerEl.title = 'Player';
    
    playerOverlay.appendChild(markerEl);
    playerMarker = markerEl;
    updatePlayerOverlaySize();
}

function updatePlayerMarkerPosition(gameX, gameY) {
    if (!mapImageLoaded || !playerMarker) return;
    
    const [imgX, imgY] = gameToImageCoords(gameX, gameY, mapImage.naturalHeight);
    playerMarker.style.left = `${imgX}px`;
    playerMarker.style.top = `${imgY}px`;
    updateMarkerTransforms();
}

function updatePlayerOverlaySize() {
    if (!mapImageLoaded || !playerOverlay) return;
    
    const imgWidth = mapImage.naturalWidth;
    const imgHeight = mapImage.naturalHeight;
    
    playerOverlay.style.width = `${imgWidth}px`;
    playerOverlay.style.height = `${imgHeight}px`;
}

// Initialize
init();
