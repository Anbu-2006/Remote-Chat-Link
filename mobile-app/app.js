let sessionPin = new URLSearchParams(window.location.search).get('pin');
if (!sessionPin) {
    sessionPin = prompt("Enter the 6-digit PIN shown on your PC:");
}

const video = document.getElementById('screenVideo');
const touchLayer = document.getElementById('touchLayer');
const scrollZone = document.getElementById('scrollZone');
const latencyEl = document.getElementById('latency');

const mobileTextInput = document.getElementById('mobileTextInput');
const keyboardCloseBtn = document.getElementById('keyboardCloseBtn');

let rightClickMode = false;
let dragMode = false;
let viewMode = false;
let dataConnection = null;

let touchStartX = 0;
let touchStartY = 0;
let touchStartValX = 0;
let touchStartValY = 0;
let lastTouchY2 = 0; // for scroll tracking
let touchActive = false;
let hasMoved = false;
let touchStartTime = 0;

// Connect to signaling server via PeerJS
const peer = new Peer();

peer.on('open', (id) => {
    console.log('Mobile signaling connection open. ID:', id);
    document.getElementById('offlineOverlay').querySelector('p').innerText = "Connecting to Desktop PC...";
    
    const pcId = `ag-remote-${sessionPin}`;
    dataConnection = peer.connect(pcId);
    
    dataConnection.on('open', () => {
        console.log('WebRTC Data Channel established.');
        
        // 1. Send viewport aspect ratio on handshake
        const aspect = window.innerWidth / window.innerHeight;
        dataConnection.send({
            type: 'init',
            payload: {
                aspectRatio: aspect
            }
        });
        
        // 2. Call the PC to retrieve mirrored stream
        // Create dummy track to satisfy WebRTC handshake
        const dummyCanvas = document.createElement('canvas');
        const dummyStream = dummyCanvas.captureStream(0);
        
        const call = peer.call(pcId, dummyStream);
        call.on('stream', (remoteStream) => {
            console.log('Received remote crop stream.');
            video.srcObject = remoteStream;
            document.getElementById('offlineOverlay').classList.add('hidden');
        });
        
        call.on('close', () => {
            document.getElementById('offlineOverlay').classList.remove('hidden');
        });
    });

    dataConnection.on('close', () => {
        document.getElementById('offlineOverlay').classList.remove('hidden');
        document.getElementById('offlineOverlay').querySelector('p').innerText = "Connection with PC closed.";
    });
});

peer.on('error', (err) => {
    console.error('PeerJS error:', err);
    const offlineP = document.getElementById('offlineOverlay').querySelector('p');
    if (err.type === 'peer-unavailable') {
        offlineP.innerText = "Desktop PC is offline. Ensure the Desktop App is running.";
    } else {
        offlineP.innerText = "Connection failure: " + err.type;
    }
    document.getElementById('offlineOverlay').classList.remove('hidden');
});

peer.on('disconnected', () => {
    console.log('Signaling lost. Reconnecting...');
    peer.reconnect();
});

// Calculate latency indicators
let lastPingTime = Date.now();
setInterval(() => {
    if (dataConnection && dataConnection.open) {
        lastPingTime = Date.now();
        dataConnection.send({ type: 'ping' });
    }
}, 3000);

// Receive connection feedback
peer.on('connection', (conn) => {
    conn.on('data', (data) => {
        if (data.type === 'pong') {
            const rtt = Date.now() - lastPingTime;
            latencyEl.innerText = `${rtt}ms`;
        }
    });
});

// --- Mouse Drag and Click event sender ---
function sendInputEvent(type, payload) {
    if (!dataConnection || !dataConnection.open) return;
    dataConnection.send({
        type: type,
        payload: payload
    });
}

// Convert screen touches to coordinates relative to video container
function getRelativeCoords(e) {
    const rect = video.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return null;

    // Relative positions (0.0 to 1.0) inside the mirrored video block
    const relX = (touch.clientX - rect.left) / rect.width;
    const relY = (touch.clientY - rect.top) / rect.height;

    return {
        relX: Math.max(0, Math.min(1, relX)),
        relY: Math.max(0, Math.min(1, relY))
    };
}

// Touch Handlers
let isScrollingGesture = false;
let clientStartY = 0;
let clientLastY = 0;

touchLayer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchActive = true;
    hasMoved = false;
    touchStartTime = Date.now();
    isScrollingGesture = false;
    
    // Two-finger scroll tracking initialization
    if (e.touches.length === 2) {
        lastTouchY2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        return;
    }

    const touch = e.touches[0];
    clientStartY = touch.clientY;
    clientLastY = touch.clientY;

    const coords = getRelativeCoords(e);
    if (!coords) return;

    touchStartX = coords.relX;
    touchStartY = coords.relY;

    if (viewMode) {
        // In View Control mode, just record starting point for panning
        return;
    }

    if (dragMode) {
        // Send direct Mouse Down on PC
        sendInputEvent('mouseEvent', {
            type: 'mousedown',
            relX: coords.relX,
            relY: coords.relY,
            button: rightClickMode ? 'right' : 'left'
        });
    } else {
        // Position cursor on PC at touchstart
        sendInputEvent('mouseEvent', {
            type: 'move',
            relX: coords.relX,
            relY: coords.relY
        });
    }
}, { passive: false });

touchLayer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touchActive) return;

    // Two-finger Scroll behavior
    if (e.touches.length === 2) {
        const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const deltaY = currentY - lastTouchY2;
        lastTouchY2 = currentY;
        
        // Scroll unit conversion: negative is scroll down, positive is scroll up
        const scrollDelta = deltaY > 0 ? 1 : -1;
        sendInputEvent('mouseEvent', {
            type: 'scroll',
            delta: scrollDelta
        });
        return;
    }

    const coords = getRelativeCoords(e);
    if (!coords) return;

    if (viewMode) {
        // Send viewport pan delta relative to drag movement
        const dx = coords.relX - touchStartX;
        const dy = coords.relY - touchStartY;
        
        // Update drag references for relative accumulation
        touchStartX = coords.relX;
        touchStartY = coords.relY;

        sendInputEvent('viewportEvent', {
            action: 'pan',
            dx: dx,
            dy: dy
        });
        return;
    }

    const touch = e.touches[0];
    const clientY = touch.clientY;
    const dragDistY = clientY - clientStartY;

    if (dragMode) {
        // Drag mode: drag cursor
        sendInputEvent('mouseEvent', {
            type: 'move',
            relX: coords.relX,
            relY: coords.relY
        });
        return;
    }

    // Default mode: check if it's a scroll gesture
    if (!isScrollingGesture && Math.abs(dragDistY) > 8) {
        isScrollingGesture = true;
    }

    if (isScrollingGesture) {
        const deltaY = clientY - clientLastY;
        clientLastY = clientY;
        
        if (Math.abs(deltaY) > 1.5) {
            // Scroll delta: positive is scroll up, negative is scroll down
            const scrollDelta = deltaY > 0 ? 1 : -1;
            sendInputEvent('mouseEvent', {
                type: 'scroll',
                delta: scrollDelta,
                relX: coords.relX,
                relY: coords.relY
            });
        }
    } else {
        // Even if not scrolling yet, check if finger moved significantly
        const moveDist = Math.hypot(coords.relX - touchStartX, coords.relY - touchStartY);
        if (moveDist > 0.015) {
            hasMoved = true;
        }
    }
}, { passive: false });

touchLayer.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchActive = false;

    if (viewMode) {
        return;
    }

    const coords = getRelativeCoords(e);
    if (!coords) return;

    if (dragMode) {
        // Send Mouse Up
        sendInputEvent('mouseEvent', {
            type: 'mouseup',
            relX: coords.relX,
            relY: coords.relY,
            button: rightClickMode ? 'right' : 'left'
        });
    } else {
        if (!isScrollingGesture) {
            const duration = Date.now() - touchStartTime;
            if (!hasMoved && duration < 300) {
                // It's a tap/click!
                sendInputEvent('mouseEvent', {
                    type: 'click',
                    relX: coords.relX,
                    relY: coords.relY,
                    button: rightClickMode ? 'right' : 'left'
                });
                
                // Focus the mobile text input to pop up the soft keyboard
                setTimeout(() => {
                    mobileTextInput.focus();
                }, 50);
            }
        }
    }

    // Auto-disable right-click toggle after actions
    if (rightClickMode) {
        setRightClick(false);
    }
}, { passive: false });

// --- Scroll Zone Touch Handlers (fallback one-finger vertical scrolling) ---
let scrollStartY = 0;
let lastScrollY = 0;
let scrollActive = false;

scrollZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    scrollActive = true;
    const touch = e.touches[0];
    scrollStartY = touch.clientY;
    lastScrollY = touch.clientY;
}, { passive: false });

scrollZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!scrollActive) return;
    const touch = e.touches[0];
    const currentY = touch.clientY;
    const deltaY = currentY - lastScrollY;
    lastScrollY = currentY;
    
    if (Math.abs(deltaY) > 2) {
        const coords = getRelativeCoords(e) || { relX: 0.5, relY: 0.5 };
        const scrollDelta = deltaY > 0 ? 1 : -1;
        sendInputEvent('mouseEvent', {
            type: 'scroll',
            delta: scrollDelta,
            relX: coords.relX,
            relY: coords.relY
        });
    }
}, { passive: false });

scrollZone.addEventListener('touchend', (e) => {
    e.preventDefault();
    scrollActive = false;
}, { passive: false });

// --- Controls UI Bindings ---

// Diff-based real-time keyboard mirroring
let lastInputValue = "";
mobileTextInput.value = "";

mobileTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Escape') {
        sendInputEvent('keyEvent', {
            type: 'type',
            key: e.key
        });
        e.preventDefault();
    } else if (e.key === 'Enter') {
        sendInputEvent('keyEvent', {
            type: 'type',
            key: 'Enter'
        });
        mobileTextInput.value = '';
        lastInputValue = '';
        e.preventDefault();
    }
});

mobileTextInput.addEventListener('input', (e) => {
    const val = e.target.value;
    
    if (val === lastInputValue) return;
    
    if (val.startsWith(lastInputValue)) {
        // Characters added at the end
        const added = val.substring(lastInputValue.length);
        if (added) {
            sendInputEvent('keyEvent', {
                type: 'type',
                text: added
            });
        }
    } else if (lastInputValue.startsWith(val)) {
        // Characters deleted from the end
        const deletedCount = lastInputValue.length - val.length;
        for (let i = 0; i < deletedCount; i++) {
            sendInputEvent('keyEvent', {
                type: 'type',
                key: 'Backspace'
            });
        }
    } else {
        // Complex replacement
        for (let i = 0; i < lastInputValue.length; i++) {
            sendInputEvent('keyEvent', {
                type: 'type',
                key: 'Backspace'
            });
        }
        if (val) {
            sendInputEvent('keyEvent', {
                type: 'type',
                text: val
            });
        }
    }
    
    lastInputValue = val;
});



keyboardCloseBtn.onclick = () => {
    mobileTextInput.blur();
};

// Resend aspect ratio on viewport resize / rotation
window.addEventListener('resize', () => {
    if (dataConnection && dataConnection.open) {
        const aspect = window.innerWidth / window.innerHeight;
        console.log('Viewport resized, resending aspect ratio:', aspect);
        dataConnection.send({
            type: 'init',
            payload: {
                aspectRatio: aspect
            }
        });
    }
});
