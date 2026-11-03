/**
 * EinkProject iOS Darkroom App Controller
 * Spotify Dark Theme · Touch Gestures · 3D LUTs · E-Ink Dithering
 */

import { FrameSimulator } from './components/frame_simulator.js';
import { NFCModal } from './components/nfc_modal.js';
import { ditherAtkinson, ditherFloydSteinberg } from './engine/dither.js';
import { pack2BitMSB, downloadBinaryFile } from './engine/packer.js';
import { loadCubeLUT, applyLUTToImageData, applyParametricAdjustments } from './engine/lut.js';
import { fetchFilters, recordFlashTelemetry } from './api.js';

class EinkApp {
  constructor() {
    this.state = {
      imageSrc: 'assets/samples/sunset.png',
      currentImage: null,
      selectedPreset: null,
      ditherAlgorithm: 'atkinson',
      frameTemplate: 'polaroid', // 'polaroid' | 'full'

      // Transform & Composition State
      rotation: 0,   // 0, 90, 180, 270
      flipH: false,  // boolean
      zoom: 1.0,     // 1.0 .. 3.0
      panX: 0,       // px
      panY: 0,       // px

      // Basic Tone Adjustments
      brightness: 0,      // -50 .. +50
      contrast: 1.20,     // 0.60 .. 1.60
      saturation: 1.15,   // 0.00 .. 2.00
      warmth: 0,          // -50 .. +50
      sharpness: 0.40,    // 0.00 .. 1.00
      redDamper: 1.15,    // 1.00 .. 1.50

      packed30kPayload: null,
      presets: []
    };

    this.simulator = null;
    this.nfcModal = null;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 400;
    this.offscreenCanvas.height = 300;
    this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  async init() {
    console.log('Initializing EinkProject iOS Darkroom App...');

    // 1. Initialize Frame Simulator with Touch Pan & Zoom Handlers
    const simContainer = document.getElementById('frameSimContainer');
    this.simulator = new FrameSimulator(simContainer, {
      onPan: (dx, dy) => {
        this.state.panX += dx;
        this.state.panY += dy;
        this.renderPipeline(false);
      },
      onZoomDelta: (delta) => {
        this.state.zoom = Math.min(3.0, Math.max(1.0, this.state.zoom + delta));
        this.renderPipeline(false);
      }
    });

    // 2. Initialize NFC Flash Modal
    const modalEl = document.getElementById('nfcModal');
    this.nfcModal = new NFCModal(modalEl, {
      onFlashSuccess: (meta) => {
        recordFlashTelemetry({
          device_uid: meta.deviceUid,
          frame_bytes: meta.payloadSize,
          preset_id: this.state.selectedPreset?.id || 'none',
          status: 'success'
        });
        const ditherResult = this.computeDither();
        if (ditherResult) {
          this.simulator.triggerWaveformRefresh(ditherResult.imageData);
        }
      }
    });

    // 3. Load presets & build UI
    await this.loadPresets();
    this.bindEvents();

    // 4. Load initial sample
    await this.loadImage(this.state.imageSrc);
  }

  async loadPresets() {
    const shelf = document.getElementById('filmShelfContainer');
    shelf.innerHTML = '<div style="color: var(--color-text-secondary); padding: 12px;">加载胶片库...</div>';

    try {
      this.state.presets = await fetchFilters();
    } catch (e) {
      console.error('Failed to load presets:', e);
      this.state.presets = [];
    }

    shelf.innerHTML = '';
    if (!this.state.presets.length) return;

    this.state.selectedPreset = this.state.presets.find(p => p.id === 'polaroid_600') || this.state.presets[0];

    this.state.presets.forEach((preset) => {
      const card = document.createElement('div');
      card.className = `film-card ${preset.id === this.state.selectedPreset.id ? 'active' : ''}`;
      card.dataset.id = preset.id;

      let badgeClass = 'badge-film';
      let brandTag = 'FILM';
      if (preset.id.startsWith('polaroid')) {
        badgeClass = 'badge-polaroid';
        brandTag = 'POLAROID';
      } else if (preset.id.startsWith('fuji')) {
        badgeClass = 'badge-fuji';
        brandTag = 'FUJIFILM';
      } else if (preset.id.startsWith('kodak') || preset.id.startsWith('kodachrome')) {
        badgeClass = 'badge-kodak';
        brandTag = 'KODAK';
      } else if (preset.id.startsWith('ilford')) {
        badgeClass = 'badge-mono';
        brandTag = 'ILFORD';
      }

      card.innerHTML = `
        <div class="film-card-thumb">
          <img src="assets/thumbs/${preset.id}.png" alt="${preset.name}" loading="lazy">
        </div>
        <div class="film-card-info">
          <span class="film-card-name" title="${preset.name}">${preset.name}</span>
          <span class="badge ${badgeClass} film-card-tag">${brandTag}</span>
        </div>
        <div class="film-card-active-check">✓</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.film-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.state.selectedPreset = preset;
        this.renderPipeline(false);
      });

      shelf.appendChild(card);
    });
  }

  bindEvents() {
    // Tab switching (Presets / Toning / Framing)
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const activePanel = document.getElementById(targetId);
        if (activePanel) activePanel.classList.add('active');
      });
    });

    // Transform controls: Rotate CCW / CW / Flip
    document.getElementById('btnRotateCCW').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      this.renderPipeline(false);
    });

    document.getElementById('btnRotateCW').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      this.renderPipeline(false);
    });

    document.getElementById('btnFlipH').addEventListener('click', () => {
      this.state.flipH = !this.state.flipH;
      document.getElementById('btnFlipH').classList.toggle('active', this.state.flipH);
      this.renderPipeline(false);
    });

    // Toggle Split View & Texture
    const btnSplit = document.getElementById('btnToggleSplit');
    btnSplit.addEventListener('click', () => {
      const enabled = !btnSplit.classList.contains('active');
      btnSplit.classList.toggle('active', enabled);
      this.simulator.toggleSplit(enabled);
    });

    const btnTexture = document.getElementById('btnToggleTexture');
    btnTexture.addEventListener('click', () => {
      const enabled = !btnTexture.classList.contains('active');
      btnTexture.classList.toggle('active', enabled);
      this.simulator.toggleTexture(enabled);
    });

    // Reset All (Rotation, Crop, Tone)
    document.getElementById('btnResetAll').addEventListener('click', () => {
      this.resetTransform();
      this.resetTones();
      this.renderPipeline(false);
    });

    document.getElementById('btnResetTone').addEventListener('click', () => {
      this.resetTones();
      this.renderPipeline(false);
    });

    // Sliders
    this.bindSlider('sliderBrightness', 'valBrightness', (v) => { this.state.brightness = v; }, (v) => v);
    this.bindSlider('sliderContrast', 'valContrast', (v) => { this.state.contrast = v; }, (v) => v.toFixed(2));
    this.bindSlider('sliderSaturation', 'valSaturation', (v) => { this.state.saturation = v; }, (v) => v.toFixed(2));
    this.bindSlider('sliderWarmth', 'valWarmth', (v) => { this.state.warmth = v; }, (v) => v);
    this.bindSlider('sliderSharpness', 'valSharpness', (v) => { this.state.sharpness = v / 100; }, (v) => `${v}%`);
    this.bindSlider('sliderRedDamper', 'valRedDamper', (v) => { this.state.redDamper = v; }, (v) => v.toFixed(2));

    // Framing buttons
    const btnPolaroid = document.getElementById('btnFramePolaroid');
    const btnFull = document.getElementById('btnFrameFull');
    btnPolaroid.addEventListener('click', () => {
      btnPolaroid.classList.add('active');
      btnFull.classList.remove('active');
      this.state.frameTemplate = 'polaroid';
      this.renderPipeline(false);
    });
    btnFull.addEventListener('click', () => {
      btnFull.classList.add('active');
      btnPolaroid.classList.remove('active');
      this.state.frameTemplate = 'full';
      this.renderPipeline(false);
    });

    // Dither algorithm buttons
    const btnAtkinson = document.getElementById('btnAtkinson');
    const btnFloyd = document.getElementById('btnFloyd');
    btnAtkinson.addEventListener('click', () => {
      btnAtkinson.classList.add('active');
      btnFloyd.classList.remove('active');
      this.state.ditherAlgorithm = 'atkinson';
      this.renderPipeline(false);
    });
    btnFloyd.addEventListener('click', () => {
      btnFloyd.classList.add('active');
      btnAtkinson.classList.remove('active');
      this.state.ditherAlgorithm = 'floyd';
      this.renderPipeline(false);
    });

    // Upload photo
    const fileInput = document.getElementById('fileUploadInput');
    document.getElementById('btnUploadPhoto').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          this.resetTransform();
          this.loadImage(evt.target.result);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    // Sample Picker Action Sheet
    const sampleSheet = document.getElementById('sampleSheet');
    document.getElementById('btnOpenSamples').addEventListener('click', () => {
      sampleSheet.showModal();
    });

    const selectSample = (src) => {
      sampleSheet.close();
      this.resetTransform();
      this.loadImage(src);
    };

    document.getElementById('sheetSunset').addEventListener('click', () => selectSample('assets/samples/sunset.png'));
    document.getElementById('sheetPortrait').addEventListener('click', () => selectSample('assets/samples/portrait.png'));
    document.getElementById('sheetStreet').addEventListener('click', () => selectSample('assets/samples/street.png'));

    // Waveform refresh simulation button
    document.getElementById('btnTriggerRefresh').addEventListener('click', () => {
      const ditherResult = this.computeDither();
      if (ditherResult) {
        this.simulator.triggerWaveformRefresh(ditherResult.imageData);
      }
    });

    // NFC Flash CTA
    document.getElementById('btnTriggerFlash').addEventListener('click', () => {
      if (!this.state.packed30kPayload) {
        this.renderPipeline(false);
      }
      this.nfcModal.open(this.state.packed30kPayload);
    });
  }

  bindSlider(sliderId, valId, setter, formatter) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valId);
    if (!slider || !label) return;

    slider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      setter(v);
      label.textContent = formatter(v);
      this.renderPipeline(false);
    });
  }

  resetTransform() {
    this.state.rotation = 0;
    this.state.flipH = false;
    this.state.zoom = 1.0;
    this.state.panX = 0;
    this.state.panY = 0;
    const btnFlip = document.getElementById('btnFlipH');
    if (btnFlip) btnFlip.classList.remove('active');
  }

  resetTones() {
    this.state.brightness = 0;
    this.state.contrast = 1.20;
    this.state.saturation = 1.15;
    this.state.warmth = 0;
    this.state.sharpness = 0.40;
    this.state.redDamper = 1.15;

    document.getElementById('sliderBrightness').value = 0;
    document.getElementById('valBrightness').textContent = '0';
    document.getElementById('sliderContrast').value = 1.20;
    document.getElementById('valContrast').textContent = '1.20';
    document.getElementById('sliderSaturation').value = 1.15;
    document.getElementById('valSaturation').textContent = '1.15';
    document.getElementById('sliderWarmth').value = 0;
    document.getElementById('valWarmth').textContent = '0';
    document.getElementById('sliderSharpness').value = 40;
    document.getElementById('valSharpness').textContent = '40%';
    document.getElementById('sliderRedDamper').value = 1.15;
    document.getElementById('valRedDamper').textContent = '1.15';
  }

  async loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.state.currentImage = img;
        this.renderPipeline(true);
        resolve();
      };
      img.src = src;
    });
  }

  /**
   * Main Photographic & Transformation Pipeline
   */
  async renderPipeline(triggerWaveformAnimation = false) {
    if (!this.state.currentImage) return;

    const ctx = this.offCtx;
    ctx.clearRect(0, 0, 400, 300);

    let photoBox = { x: 0, y: 0, w: 400, h: 300 };

    // 1. Polaroid Framing or Full Bleed
    if (this.state.frameTemplate === 'polaroid') {
      ctx.fillStyle = '#F5F2EB'; // E-ink paper white border
      ctx.fillRect(0, 0, 400, 300);

      photoBox = { x: 16, y: 16, w: 368, h: 238 };

      // Subtitle
      ctx.fillStyle = '#181818';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      const presetName = this.state.selectedPreset ? this.state.selectedPreset.name : 'RNI ALL FILMS';
      ctx.fillText(`${presetName.toUpperCase()} · 2026`, 200, 278);
    }

    // 2. Render Image with Rotation, Flip, Zoom and Pan
    this.renderTransformedImage(ctx, this.state.currentImage, photoBox);

    // Set original preview in split comparison
    this.simulator.setOriginalImage(this.offscreenCanvas);

    // 3. Extract Pixel Buffer
    let pixels = ctx.getImageData(0, 0, 400, 300);

    // 4. Apply RNI 3D LUT
    if (this.state.selectedPreset && this.state.selectedPreset.cube_file) {
      try {
        const cubeUrl = `presets/cube/${this.state.selectedPreset.cube_file}`;
        const lut = await loadCubeLUT(cubeUrl);
        pixels = applyLUTToImageData(lut, pixels, 1.0);
      } catch (err) {
        console.warn('LUT apply skipped:', err);
      }
    }

    // 5. Apply Parametric Darkroom Grading (Brightness, Contrast, Saturation, Warmth, Sharpness)
    pixels = applyParametricAdjustments(pixels, {
      brightness: this.state.brightness,
      contrast: this.state.contrast,
      saturation: this.state.saturation,
      warmth: this.state.warmth,
      sharpness: this.state.sharpness
    });

    // 6. 4-Color Quantization & Dithering
    let ditherResult;
    if (this.state.ditherAlgorithm === 'atkinson') {
      ditherResult = ditherAtkinson(pixels, this.state.redDamper);
    } else {
      ditherResult = ditherFloydSteinberg(pixels, this.state.redDamper);
    }

    // 7. Hardware 2-Bit Packing (30,000 Bytes)
    this.state.packed30kPayload = pack2BitMSB(ditherResult.indices);

    // 8. Update Frame Simulator Display
    this.simulator.renderDitheredImage(ditherResult.imageData, triggerWaveformAnimation);

    // 9. Update Palette Histogram
    this.updateHistogramUI(ditherResult.stats);
  }

  computeDither() {
    const pixels = this.offCtx.getImageData(0, 0, 400, 300);
    if (this.state.ditherAlgorithm === 'atkinson') {
      return ditherAtkinson(pixels, this.state.redDamper);
    }
    return ditherFloydSteinberg(pixels, this.state.redDamper);
  }

  /**
   * Render Transformed Image inside Photo Box with Pan, Zoom, Rotation & Flip
   */
  renderTransformedImage(ctx, img, box) {
    ctx.save();

    // Clip to bounding box
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    // Check if swap width/height due to 90 or 270 degree rotation
    const isRotated90 = (this.state.rotation === 90 || this.state.rotation === 270);
    const effectiveW = isRotated90 ? imgH : imgW;
    const effectiveH = isRotated90 ? imgW : imgH;

    // Cover scale factor
    const scale = Math.max(box.w / effectiveW, box.h / effectiveH) * this.state.zoom;

    const centerX = box.x + box.w / 2 + this.state.panX;
    const centerY = box.y + box.h / 2 + this.state.panY;

    ctx.translate(centerX, centerY);
    ctx.rotate((this.state.rotation * Math.PI) / 180);
    ctx.scale(this.state.flipH ? -1 : 1, 1);

    const drawW = imgW * scale;
    const drawH = imgH * scale;

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  updateHistogramUI(stats) {
    const pctBlack = document.getElementById('histBlackPct');
    const pctWhite = document.getElementById('histWhitePct');
    const pctYellow = document.getElementById('histYellowPct');
    const pctRed = document.getElementById('histRedPct');

    if (pctBlack) pctBlack.textContent = stats.percentages.black;
    if (pctWhite) pctWhite.textContent = stats.percentages.white;
    if (pctYellow) pctYellow.textContent = stats.percentages.yellow;
    if (pctRed) pctRed.textContent = stats.percentages.red;
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const app = new EinkApp();
  app.init().catch(console.error);
});
