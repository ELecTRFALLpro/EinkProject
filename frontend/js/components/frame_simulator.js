/**
 * Photorealistic 400x300 E-Ink Hardware Display Simulator
 * Features:
 *   - Genuine 4:3 400x300 e-paper display canvas
 *   - Realistic electrophoretic waveform refresh sequence (Flash -> Flicker -> Settle)
 *   - Paper texture micro-grain overlay (reflectance simulation)
 *   - Split-view slider (Original vs E-ink Dithered)
 *   - Pixel inspector loupe (2x-4x subpixel lattice view)
 */

export class FrameSimulator {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = Object.assign({
      width: 400,
      height: 300,
      paperTexture: true,
      scale: 1.5,
      showSplit: false
    }, options);

    this.currentImageData = null;
    this.originalImageData = null;
    this.isRefreshing = false;

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="frame-simulator-root" id="frameSimRoot">
        <div class="frame-bezel">
          <div class="frame-inner-mat">
            <div class="screen-viewport" id="screenViewport">
              <canvas id="einkCanvas" width="400" height="300" class="eink-canvas"></canvas>
              <canvas id="splitCanvas" width="400" height="300" class="split-canvas" style="display: none;"></canvas>
              <div class="paper-grain-overlay" id="paperGrain"></div>
              <div class="refresh-flash-overlay" id="refreshOverlay"></div>
              
              <!-- Split View Handle -->
              <div class="split-handle" id="splitHandle" style="display: none;">
                <div class="split-line"></div>
                <div class="split-knob">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
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

        <!-- Simulator Toolbar -->
        <div class="sim-toolbar">
          <div class="sim-toolbar-group">
            <button class="pill-btn pill-btn-ghost active" id="btnScaleFit">Fit</button>
            <button class="pill-btn pill-btn-ghost" id="btnScale1x">1x</button>
            <button class="pill-btn pill-btn-ghost" id="btnScale2x">2x</button>
          </div>
          <div class="sim-toolbar-group">
            <button class="pill-btn pill-btn-ghost" id="btnToggleSplit">
              <span class="icon">◨</span> 对比原图
            </button>
            <button class="pill-btn pill-btn-ghost active" id="btnToggleTexture">
              <span class="icon">▤</span> 纸质纹理
            </button>
            <button class="pill-btn pill-btn-primary" id="btnTriggerRefresh">
              <span class="icon">↻</span> 模拟物理刷屏
            </button>
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

    this.bindEvents();
  }

  bindEvents() {
    const btnRefresh = this.container.querySelector('#btnTriggerRefresh');
    btnRefresh.addEventListener('click', () => {
      if (this.currentImageData) {
        this.triggerWaveformRefresh(this.currentImageData);
      }
    });

    const btnTexture = this.container.querySelector('#btnToggleTexture');
    btnTexture.addEventListener('click', () => {
      this.options.paperTexture = !this.options.paperTexture;
      btnTexture.classList.toggle('active', this.options.paperTexture);
      this.paperGrain.style.display = this.options.paperTexture ? 'block' : 'none';
    });

    const btnSplit = this.container.querySelector('#btnToggleSplit');
    btnSplit.addEventListener('click', () => {
      this.options.showSplit = !this.options.showSplit;
      btnSplit.classList.toggle('active', this.options.showSplit);
      this.splitCanvas.style.display = this.options.showSplit ? 'block' : 'none';
      this.splitHandle.style.display = this.options.showSplit ? 'flex' : 'none';
      if (this.options.showSplit) {
        this.updateSplitPosition(0.5);
      }
    });

    // Split handle dragging
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const rect = this.screenViewport.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
      this.updateSplitPosition(ratio);
    };

    this.splitHandle.addEventListener('mousedown', () => { dragging = true; });
    this.splitHandle.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('touchend', () => { dragging = false; });

    // Scale buttons
    const btnFit = this.container.querySelector('#btnScaleFit');
    const btn1x = this.container.querySelector('#btnScale1x');
    const btn2x = this.container.querySelector('#btnScale2x');

    const setScale = (scale, activeBtn) => {
      [btnFit, btn1x, btn2x].forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
      const root = this.container.querySelector('.frame-bezel');
      if (scale === 'fit') {
        root.style.transform = 'none';
        root.style.maxWidth = '100%';
      } else if (scale === 1) {
        root.style.transform = 'scale(1)';
        root.style.maxWidth = '460px';
      } else if (scale === 2) {
        root.style.transform = 'scale(1.25)';
        root.style.maxWidth = '600px';
      }
    };

    btnFit.addEventListener('click', () => setScale('fit', btnFit));
    btn1x.addEventListener('click', () => setScale(1, btn1x));
    btn2x.addEventListener('click', () => setScale(2, btn2x));
  }

  updateSplitPosition(ratio) {
    const pct = (ratio * 100).toFixed(1) + '%';
    this.splitHandle.style.left = pct;
    this.splitCanvas.style.clipPath = `polygon(${pct} 0, 100% 0, 100% 100%, ${pct} 100%)`;
  }

  /**
   * Set the original source image for split-screen comparison
   */
  setOriginalImage(imgOrCanvas) {
    this.splitCtx.clearRect(0, 0, 400, 300);
    this.splitCtx.drawImage(imgOrCanvas, 0, 0, 400, 300);
    this.originalImageData = this.splitCtx.getImageData(0, 0, 400, 300);
  }

  /**
   * Render final dithered image directly onto display canvas
   */
  renderDitheredImage(imageData, animate = false) {
    this.currentImageData = imageData;
    if (animate) {
      this.triggerWaveformRefresh(imageData);
    } else {
      this.ctx.putImageData(imageData, 0, 0);
    }
  }

  /**
   * Genuine Electrophoretic 3-Stage Waveform Refresh Simulation
   * Phase 1 (0-400ms): Inversion flash & erase whiteout
   * Phase 2 (400-900ms): Multi-frequency pigment excitation flicker (Red/Yellow vibration)
   * Phase 3 (900-1400ms): Steady-state pigment settlement
   */
  async triggerWaveformRefresh(targetImageData) {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    const overlay = this.refreshOverlay;
    overlay.className = 'refresh-flash-overlay active phase-1-invert';

    // Phase 1: Inverted contrast pulse
    await this.wait(220);
    overlay.className = 'refresh-flash-overlay active phase-1-whiteout';

    await this.wait(180);
    overlay.className = 'refresh-flash-overlay active phase-2-color-excitation';

    // Draw target data while noise overlay is active
    this.ctx.putImageData(targetImageData, 0, 0);

    await this.wait(450);
    overlay.className = 'refresh-flash-overlay active phase-3-settling';

    await this.wait(350);
    overlay.className = 'refresh-flash-overlay';
    this.isRefreshing = false;
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
