/**
 * Photorealistic 400x300 E-Ink Hardware Display Simulator
 * Enhanced with iOS Touch Gestures (Drag Pan & Pinch Zoom)
 */

export class FrameSimulator {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = Object.assign({
      width: 400,
      height: 300,
      paperTexture: true,
      showSplit: false,
      onGestureChange: null // callback (panX, panY, zoom)
    }, options);

    this.currentImageData = null;
    this.originalImageData = null;
    this.isRefreshing = false;

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="frame-bezel" id="frameBezel">
        <div class="frame-inner-mat">
          <div class="screen-viewport" id="screenViewport">
            <canvas id="einkCanvas" width="400" height="300" class="eink-canvas"></canvas>
            <canvas id="splitCanvas" width="400" height="300" class="split-canvas" style="display: none;"></canvas>
            <div class="paper-grain-overlay" id="paperGrain"></div>
            <div class="refresh-flash-overlay" id="refreshOverlay"></div>
            <div class="gesture-hint" id="gestureHint">按住可自由平移构图</div>
            
            <!-- Split View Handle -->
            <div class="split-handle" id="splitHandle" style="display: none;">
              <div class="split-line"></div>
              <div class="split-knob">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M8.5 5l-5 7 5 7M15.5 5l5 7-5 7"/>
                </svg>
              </div>
            </div>
          </div>
          <div class="frame-engraving">
            <span>EPAPER 4.01" · 400×300 2-BIT</span>
          </div>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#einkCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.splitCanvas = this.container.querySelector('#splitCanvas');
    this.splitCtx = this.splitCanvas.getContext('2d');
    this.paperGrain = this.container.querySelector('#paperGrain');
    this.refreshOverlay = this.container.querySelector('#refreshOverlay');
    this.splitHandle = this.container.querySelector('#splitHandle');
    this.screenViewport = this.container.querySelector('#screenViewport');
    this.gestureHint = this.container.querySelector('#gestureHint');

    this.bindGestures();
  }

  bindGestures() {
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let initialPinchDist = 0;

    const viewport = this.screenViewport;

    // Pointer events for smooth touch & mouse dragging
    viewport.addEventListener('pointerdown', (e) => {
      // If split handle is visible and clicked nearby, ignore pan
      if (this.options.showSplit && Math.abs(e.clientX - this.splitHandle.getBoundingClientRect().left) < 30) {
        return;
      }
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      viewport.setPointerCapture(e.pointerId);
      this.gestureHint.style.opacity = '0';
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!isPanning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;

      if (typeof this.options.onPan === 'function') {
        this.options.onPan(dx, dy);
      }
    });

    const endPan = (e) => {
      if (isPanning) {
        isPanning = false;
        try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);

    // Wheel zoom on desktop
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
      if (typeof this.options.onZoomDelta === 'function') {
        this.options.onZoomDelta(zoomDelta);
      }
    }, { passive: false });

    // Touch pinch-to-zoom for iOS
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        isPanning = false;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialPinchDist > 0) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = currentDist / initialPinchDist;
        initialPinchDist = currentDist;
        const zoomDelta = (ratio - 1) * 0.8;
        if (typeof this.options.onZoomDelta === 'function') {
          this.options.onZoomDelta(zoomDelta);
        }
      }
    }, { passive: true });

    // Split handle dragging
    let draggingSplit = false;
    const onSplitMove = (e) => {
      if (!draggingSplit) return;
      const rect = this.screenViewport.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
      this.updateSplitPosition(ratio);
    };

    this.splitHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      draggingSplit = true;
    });
    window.addEventListener('pointermove', onSplitMove);
    window.addEventListener('pointerup', () => { draggingSplit = false; });
  }

  toggleSplit(enable) {
    this.options.showSplit = enable;
    this.splitCanvas.style.display = enable ? 'block' : 'none';
    this.splitHandle.style.display = enable ? 'flex' : 'none';
    if (enable) {
      this.updateSplitPosition(0.5);
    }
  }

  toggleTexture(enable) {
    this.options.paperTexture = enable;
    this.paperGrain.style.display = enable ? 'block' : 'none';
  }

  updateSplitPosition(ratio) {
    const pct = (ratio * 100).toFixed(1) + '%';
    this.splitHandle.style.left = pct;
    this.splitCanvas.style.clipPath = `polygon(${pct} 0, 100% 0, 100% 100%, ${pct} 100%)`;
  }

  setOriginalImage(imgOrCanvas) {
    this.splitCtx.clearRect(0, 0, 400, 300);
    this.splitCtx.drawImage(imgOrCanvas, 0, 0, 400, 300);
    this.originalImageData = this.splitCtx.getImageData(0, 0, 400, 300);
  }

  renderDitheredImage(imageData, animate = false) {
    this.currentImageData = imageData;
    if (animate) {
      this.triggerWaveformRefresh(imageData);
    } else {
      this.ctx.putImageData(imageData, 0, 0);
    }
  }

  async triggerWaveformRefresh(targetImageData) {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    const overlay = this.refreshOverlay;
    overlay.className = 'refresh-flash-overlay active phase-1-invert';

    await this.wait(200);
    overlay.className = 'refresh-flash-overlay active phase-1-whiteout';

    await this.wait(160);
    overlay.className = 'refresh-flash-overlay active phase-2-color-excitation';

    this.ctx.putImageData(targetImageData, 0, 0);

    await this.wait(400);
    overlay.className = 'refresh-flash-overlay active phase-3-settling';

    await this.wait(300);
    overlay.className = 'refresh-flash-overlay';
    this.isRefreshing = false;
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
