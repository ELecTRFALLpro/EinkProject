/**
 * Photorealistic 400x300 E-Ink Hardware Display Simulator
 * Enhanced with iOS Touch Gestures (Drag Pan, Pinch Zoom, Double-Tap Zoom/Reset)
 */

export class FrameSimulator {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = Object.assign({
      width: 300,
      height: 400,
      paperTexture: true,
      showSplit: false,
      onPan: null,
      onZoomDelta: null,
      onDoubleTap: null,
      onResetTransform: null
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
            <canvas id="einkCanvas" width="300" height="400" class="eink-canvas"></canvas>
            <canvas id="splitCanvas" width="300" height="400" class="split-canvas" style="display: none;"></canvas>
            <div class="paper-grain-overlay" id="paperGrain"></div>
            <div class="vf-reticle" aria-hidden="true">
              <span class="vf-corner tl"></span>
              <span class="vf-corner tr"></span>
              <span class="vf-corner bl"></span>
              <span class="vf-corner br"></span>
            </div>
            <div class="refresh-flash-overlay" id="refreshOverlay"></div>
            <div class="shutter-blink-overlay" id="shutterBlink"></div>
            <button type="button" class="zoom-reset-badge" id="zoomResetBadge" style="display: none;" title="点击一键复位构图">
              🔍 1.0x · 复位
            </button>
            <div class="gesture-hint" id="gestureHint">单指拖拽平移 · 双指缩放 · 双击放大/复位</div>
            
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
            <span id="frameEngravingText">ONESTEP 600 · 300×400 E-INK</span>
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
    this.shutterBlink = this.container.querySelector('#shutterBlink');
    this.engravingEl = this.container.querySelector('#frameEngravingText');
    this.splitHandle = this.container.querySelector('#splitHandle');
    this.screenViewport = this.container.querySelector('#screenViewport');
    this.gestureHint = this.container.querySelector('#gestureHint');
    this.zoomResetBadge = this.container.querySelector('#zoomResetBadge');

    this.bindGestures();
  }

  bindGestures() {
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let movedDist = 0;
    let initialPinchDist = 0;
    let lastTapTime = 0;

    const viewport = this.screenViewport;

    // Reset button inside viewport
    this.zoomResetBadge.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.zoomResetBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.options.onResetTransform === 'function') {
        this.options.onResetTransform();
      }
    });

    // Pointer events for smooth touch & mouse dragging
    viewport.addEventListener('pointerdown', (e) => {
      if (e.target === this.zoomResetBadge) return;
      if (this.options.showSplit && Math.abs(e.clientX - this.splitHandle.getBoundingClientRect().left) < 28) {
        return;
      }
      isPanning = true;
      movedDist = 0;
      startX = e.clientX;
      startY = e.clientY;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      this.gestureHint.style.opacity = '0';
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!isPanning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      movedDist += Math.hypot(dx, dy);
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

        // Detect clean double-tap (minimal drag movement)
        if (movedDist < 8 && e.type === 'pointerup') {
          const now = Date.now();
          if (now - lastTapTime < 280) {
            if (typeof this.options.onDoubleTap === 'function') {
              this.options.onDoubleTap();
            }
            lastTapTime = 0;
          } else {
            lastTapTime = now;
          }
        }
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
        const zoomDelta = (ratio - 1) * 0.85;
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

  updateTransformBadge({ zoom = 1.0, panX = 0, panY = 0, rotation = 0, flipH = false }) {
    const isModified = Math.abs(zoom - 1.0) > 0.01 || Math.abs(panX) > 2 || Math.abs(panY) > 2 || rotation !== 0 || flipH;
    if (isModified) {
      this.zoomResetBadge.style.display = 'inline-flex';
      const rotTxt = rotation !== 0 ? ` · ${rotation}°` : '';
      this.zoomResetBadge.textContent = `🔍 ${zoom.toFixed(1)}x${rotTxt} · 复位`;
    } else {
      this.zoomResetBadge.style.display = 'none';
    }
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
    this.splitCtx.clearRect(0, 0, 300, 400);
    this.splitCtx.drawImage(imgOrCanvas, 0, 0, 300, 400);
    this.originalImageData = this.splitCtx.getImageData(0, 0, 300, 400);
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

  setEngravingText(text) {
    if (this.engravingEl && text) {
      this.engravingEl.textContent = text;
    }
  }

  async triggerShutterBlink() {
    if (!this.shutterBlink) return;
    this.shutterBlink.classList.add('fire');
    await this.wait(110);
    this.shutterBlink.classList.remove('fire');
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
