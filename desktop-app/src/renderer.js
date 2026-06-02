const { ipcRenderer } = require('electron');
const { InputController } = require('./input-controller');
const inputController = new InputController();
const QRCode = window.QRCode || require('qrcode');

let currentStream = null; // Captured desktop stream
let croppedStream = null; // Stream obtained from cropCanvas
let peer = null;
let sessionPin = '';

const previewVideo = document.getElementById('previewVideo');
const previewContainer = document.getElementById('previewContainer');
const cropBox = document.getElementById('cropBox');
const cropCanvas = document.getElementById('cropCanvas');
const cropCtx = cropCanvas.getContext('2d');

let mobileAspectRatio = 9 / 16; // default aspect ratio (portrait)
let relCropX = 0.1;
let relCropY = 0.1;
let relCropW = 0.8;
let relCropH = 0.8;

let isDragging = false;
let isResizing = false;
let activeHandle = null;
let startX, startY;
let startLeft, startTop, startWidth, startHeight;
let animationFrameId = null;

// Initialize sources list
async function loadSources() {
  const sources = await ipcRenderer.invoke('get-sources');
  const grid = document.getElementById('sourcesGrid');
  grid.innerHTML = '';

  for (const source of sources) {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.innerHTML = `
      <img src="${source.thumbnail}" alt="source thumbnail">
      <div class="title">${source.name}</div>
    `;
    card.onclick = () => selectSource(source, card);
    grid.appendChild(card);
  }

  // Auto-select the first window/screen to enable instant capture
  if (sources.length > 0) {
    selectSource(sources[0], grid.firstChild);
  }
}

// Handle screen capture selection
async function selectSource(source, cardElement) {
  document.querySelectorAll('.source-card').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080
        }
      }
    });

    // Stop current stream if playing
    if (previewVideo.srcObject) {
      const tracks = previewVideo.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }

    previewVideo.srcObject = stream;
    previewVideo.onloadedmetadata = () => {
      // Fit previewContainer aspect ratio to match the captured window size
      const videoAspect = previewVideo.videoWidth / previewVideo.videoHeight;
      previewContainer.style.width = '100%';
      previewContainer.style.height = '100%';
      previewContainer.style.aspectRatio = `${videoAspect}`;
      
      resetCropBox();
      startDrawLoop();
    };

    document.getElementById('statusText').innerText = "Display source active. Waiting for mobile device...";
  } catch (e) {
    console.error('Failed to capture window/screen:', e);
  }
}

// Receive session pin and localtunnel details
ipcRenderer.on('tunnel-ready', (event, { url, localUrl, pin }) => {
  sessionPin = pin;
  const fullUrl = `${url}/?pin=${pin}`;
  const fullLocalUrl = `${localUrl}/?pin=${pin}`;
  
  const qrCanvas = document.getElementById('qrCanvas');
  qrCanvas.style.display = 'block';
  QRCode.toCanvas(qrCanvas, fullUrl, { width: 180, margin: 1 });
  
  document.getElementById('pinVal').innerText = pin;
  
  const pinDisplay = document.getElementById('pinDisplay');
  pinDisplay.style.display = 'block';
  pinDisplay.innerHTML = `Local WiFi Link: <a href="${fullLocalUrl}" target="_blank">${fullLocalUrl}</a>`;
  document.getElementById('statusText').innerText = "Awaiting mobile device connection...";

  initPeerJS();
});

// Configure WebRTC Peer Connection
function initPeerJS() {
  const peerId = `ag-remote-${sessionPin}`;
  
  if (peer) {
    peer.destroy();
  }

  peer = new Peer(peerId);

  peer.on('open', (id) => {
    console.log('PeerJS server connection open with ID:', id);
  });

  peer.on('connection', (conn) => {
    console.log('Mobile device data connection opened.');
    const statusBadge = document.getElementById('connectionStatus');
    statusBadge.innerText = 'CONNECTED';
    statusBadge.classList.add('connected');
    document.getElementById('statusText').innerText = "Mobile device connected. Control active!";

    conn.on('data', (data) => {
      try {
        if (data.type === 'init') {
          // Adjust aspect ratio from mobile viewport size
          if (data.payload && data.payload.aspectRatio) {
            console.log('Received mobile aspect ratio:', data.payload.aspectRatio);
            mobileAspectRatio = data.payload.aspectRatio;
            resetCropBox();
          }
        } else if (data.type === 'mouseEvent') {
          // Translate relative coordinates (from cropped screen video) to full screen coordinates
          const mobileRelX = data.payload.relX;
          const mobileRelY = data.payload.relY;

          if (mobileRelX !== undefined && mobileRelY !== undefined) {
            // Map cropped region coordinates back to full screen scale
            data.payload.relX = relCropX + (mobileRelX * relCropW);
            data.payload.relY = relCropY + (mobileRelY * relCropH);
          }
          inputController.handleMouse(data.payload);
        } else if (data.type === 'keyEvent') {
          inputController.handleKey(data.payload);
        } else if (data.type === 'viewportEvent') {
          handleViewportEvent(data.payload);
        }
      } catch (err) {
        console.error('Input Event Error:', err);
      }
    });

    conn.on('close', () => {
      console.log('Mobile device disconnected.');
      statusBadge.innerText = 'DISCONNECTED';
      statusBadge.classList.remove('connected');
      document.getElementById('statusText').innerText = "Connection lost. Visit local WiFi Link or scan QR.";
    });
  });

  peer.on('call', (call) => {
    if (!croppedStream) {
      croppedStream = cropCanvas.captureStream(30);
    }
    console.log('Answering incoming call with cropped canvas stream.');
    call.answer(croppedStream);

    // Apply high-quality encoding settings on WebRTC connection
    if (call.peerConnection) {
      const pc = call.peerConnection;
      const setHighQuality = () => {
        const senders = pc.getSenders();
        senders.forEach(sender => {
          if (sender.track && sender.track.kind === 'video') {
            try {
              const parameters = sender.getParameters();
              if (!parameters.encodings) {
                parameters.encodings = [{}];
              }
              parameters.encodings.forEach(encoding => {
                encoding.maxBitrate = 10000000; // 10 Mbps
                encoding.scaleResolutionDownBy = 1.0; // Disable resolution scaling down
              });
              sender.setParameters(parameters);
              console.log('Set WebRTC video encoding to high quality (10 Mbps).');
            } catch (err) {
              console.error('Failed to set WebRTC encoding parameters:', err);
            }
          }
        });
      };

      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          setTimeout(setHighQuality, 1000); // Wait 1s for connection stability
        }
      });
      // Fallback: also try setting immediately
      setTimeout(setHighQuality, 2000);
    }
  });

  peer.on('error', (err) => {
    console.error('PeerJS connection error:', err);
  });
}

// Real-time Canvas Rendering & Cropping loop
function startDrawLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  function draw() {
    if (previewVideo.paused || previewVideo.ended) {
      animationFrameId = requestAnimationFrame(draw);
      return;
    }

    const videoW = previewVideo.videoWidth;
    const videoH = previewVideo.videoHeight;

    if (videoW && videoH) {
      // Calculate crop bounds in absolute pixels of the stream
      const sx = relCropX * videoW;
      const sy = relCropY * videoH;
      const sw = relCropW * videoW;
      const sh = relCropH * videoH;

      // Adjust output canvas size to crop dimensions exactly (no downscaling to 1280)
      const targetW = sw;
      const targetH = sh;

      if (cropCanvas.width !== targetW || cropCanvas.height !== targetH) {
        cropCanvas.width = targetW;
        cropCanvas.height = targetH;
      }

      cropCtx.drawImage(previewVideo, sx, sy, sw, sh, 0, 0, targetW, targetH);
    }

    animationFrameId = requestAnimationFrame(draw);
  }

  draw();
  croppedStream = cropCanvas.captureStream(30);
}

// Crop Box Mouse / Touch Dragging & Resizing Logic
cropBox.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('handle')) {
    isResizing = true;
    activeHandle = e.target;
  } else {
    isDragging = true;
  }

  startX = e.clientX;
  startY = e.clientY;

  startLeft = cropBox.offsetLeft;
  startTop = cropBox.offsetTop;
  startWidth = cropBox.offsetWidth;
  startHeight = cropBox.offsetHeight;

  cropBox.setPointerCapture(e.pointerId);
  e.stopPropagation();
});

cropBox.addEventListener('pointermove', (e) => {
  if (!isDragging && !isResizing) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  const containerW = previewContainer.clientWidth;
  const containerH = previewContainer.clientHeight;

  if (isDragging) {
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // Boundary locks
    newLeft = Math.max(0, Math.min(newLeft, containerW - cropBox.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, containerH - cropBox.offsetHeight));

    cropBox.style.left = `${newLeft}px`;
    cropBox.style.top = `${newTop}px`;
  } else if (isResizing) {
    // Locked Aspect Ratio Resizing math
    if (activeHandle.classList.contains('se')) {
      let newWidth = startWidth + dx;
      if (newWidth + startLeft > containerW) newWidth = containerW - startLeft;
      let newHeight = newWidth / mobileAspectRatio;
      if (newHeight + startTop > containerH) {
        newHeight = containerH - startTop;
        newWidth = newHeight * mobileAspectRatio;
      }
      if (newWidth > 40 && newHeight > 40) {
        cropBox.style.width = `${newWidth}px`;
        cropBox.style.height = `${newHeight}px`;
      }
    } else if (activeHandle.classList.contains('sw')) {
      let newWidth = startWidth - dx;
      let newLeft = startLeft + dx;
      if (newLeft < 0) {
        newWidth = startWidth + startLeft;
        newLeft = 0;
      }
      let newHeight = newWidth / mobileAspectRatio;
      if (newHeight + startTop > containerH) {
        newHeight = containerH - startTop;
        newWidth = newHeight * mobileAspectRatio;
        newLeft = startLeft + (startWidth - newWidth);
      }
      if (newWidth > 40 && newHeight > 40) {
        cropBox.style.width = `${newWidth}px`;
        cropBox.style.height = `${newHeight}px`;
        cropBox.style.left = `${newLeft}px`;
      }
    } else if (activeHandle.classList.contains('ne')) {
      let newWidth = startWidth + dx;
      if (newWidth + startLeft > containerW) newWidth = containerW - startLeft;
      let newHeight = newWidth / mobileAspectRatio;
      let newTop = startTop + (startHeight - newHeight);
      if (newTop < 0) {
        newHeight = startHeight + startTop;
        newWidth = newHeight * mobileAspectRatio;
        newTop = 0;
      }
      if (newWidth > 40 && newHeight > 40) {
        cropBox.style.width = `${newWidth}px`;
        cropBox.style.height = `${newHeight}px`;
        cropBox.style.top = `${newTop}px`;
      }
    } else if (activeHandle.classList.contains('nw')) {
      let newWidth = startWidth - dx;
      let newLeft = startLeft + dx;
      if (newLeft < 0) {
        newWidth = startWidth + startLeft;
        newLeft = 0;
      }
      let newHeight = newWidth / mobileAspectRatio;
      let newTop = startTop + (startHeight - newHeight);
      if (newTop < 0) {
        newHeight = startHeight + startTop;
        newWidth = newHeight * mobileAspectRatio;
        newTop = 0;
        newLeft = startLeft + (startWidth - newWidth);
      }
      if (newWidth > 40 && newHeight > 40) {
        cropBox.style.width = `${newWidth}px`;
        cropBox.style.height = `${newHeight}px`;
        cropBox.style.left = `${newLeft}px`;
        cropBox.style.top = `${newTop}px`;
      }
    }
  }

  updateCropCoordinates();
});

cropBox.addEventListener('pointerup', (e) => {
  isDragging = false;
  isResizing = false;
  activeHandle = null;
  cropBox.releasePointerCapture(e.pointerId);
});

// Update percentages representation of cropped rect relative to preview video
function updateCropCoordinates() {
  const containerW = previewContainer.clientWidth;
  const containerH = previewContainer.clientHeight;
  if (!containerW || !containerH) return;

  relCropX = cropBox.offsetLeft / containerW;
  relCropY = cropBox.offsetTop / containerH;
  relCropW = cropBox.offsetWidth / containerW;
  relCropH = cropBox.offsetHeight / containerH;
}

// Fits the crop selection inside the current container aspect ratio at max dimensions
function resetCropBox() {
  const containerW = previewContainer.clientWidth;
  const containerH = previewContainer.clientHeight;
  if (!containerW || !containerH) return;

  let w, h, l, t;
  // Calculate boundary matching the mobile device's aspect ratio
  if (containerW / containerH > mobileAspectRatio) {
    h = containerH * 0.9;
    w = h * mobileAspectRatio;
  } else {
    w = containerW * 0.9;
    h = w / mobileAspectRatio;
  }

  l = (containerW - w) / 2;
  t = (containerH - h) / 2;

  cropBox.style.width = `${w}px`;
  cropBox.style.height = `${h}px`;
  cropBox.style.left = `${l}px`;
  cropBox.style.top = `${t}px`;

  updateCropCoordinates();
}

// Handle real-time crop panning & zooming from mobile client
function handleViewportEvent(payload) {
  const containerW = previewContainer.clientWidth;
  const containerH = previewContainer.clientHeight;
  if (!containerW || !containerH) return;

  const curLeft = cropBox.offsetLeft;
  const curTop = cropBox.offsetTop;
  const curWidth = cropBox.offsetWidth;
  const curHeight = cropBox.offsetHeight;

  if (payload.action === 'pan') {
    // dx and dy are relative viewport movements sent from mobile (drag scale)
    let newLeft = curLeft + (payload.dx * containerW);
    let newTop = curTop + (payload.dy * containerH);

    newLeft = Math.max(0, Math.min(newLeft, containerW - curWidth));
    newTop = Math.max(0, Math.min(newTop, containerH - curHeight));

    cropBox.style.left = `${newLeft}px`;
    cropBox.style.top = `${newTop}px`;
  } else if (payload.action === 'zoom') {
    // factor > 1 zooms out, factor < 1 zooms in
    const factor = payload.factor;
    let newWidth = curWidth * factor;

    // Boundary constraints
    newWidth = Math.max(80, Math.min(newWidth, containerW));
    let newHeight = newWidth / mobileAspectRatio;
    if (newHeight > containerH) {
      newHeight = containerH;
      newWidth = newHeight * mobileAspectRatio;
    }

    // Keep the zoom centered relative to current crop box
    let newLeft = curLeft + (curWidth - newWidth) / 2;
    let newTop = curTop + (curHeight - newHeight) / 2;

    newLeft = Math.max(0, Math.min(newLeft, containerW - newWidth));
    newTop = Math.max(0, Math.min(newTop, containerH - newHeight));

    cropBox.style.width = `${newWidth}px`;
    cropBox.style.height = `${newHeight}px`;
    cropBox.style.left = `${newLeft}px`;
    cropBox.style.top = `${newTop}px`;
  }

  updateCropCoordinates();
}

// Button actions
document.getElementById('resetCropBtn').onclick = resetCropBox;
document.getElementById('lockAspectBtn').onclick = () => {
  resetCropBox();
  console.log("Snap Aspect and Crop Resetted.");
};

// Start loading UI components
loadSources();
