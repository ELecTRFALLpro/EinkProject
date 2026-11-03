/**
 * EinkProject Web Darkroom & E-Ink Simulator
 * Spotify Dark Aesthetic Frontend Controller
 */

import { FrameSimulator } from './components/frame_simulator.js';
import { NFCModal } from './components/nfc_modal.js';
import { ditherAtkinson, ditherFloydSteinberg } from './engine/dither.js';
import { pack2BitMSB, downloadBinaryFile, downloadCanvasAsPNG } from './engine/packer.js';
import { loadCubeLUT, applyLUTToImageData, applyParametricAdjustments } from './engine/lut.js';
import { fetchFilters, fetchConfig, recordFlashTelemetry } from './api.js';

class EinkApp {
  constructor() {
    this.state = {
      imageSrc: 'assets/samples/sunset.png',
      currentImage: null,
      selectedPreset: null,
      ditherAlgorithm: 'atkinson',
      redDamper: 1.15,
      contrast: 1.20,
      saturation: 1.15,
      frameTemplate: 'polaroid', // 'polaroid' | 'full'
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
    console.log('Initializing EinkProject Darkroom Studio...');

    // 1. Initialize Frame Simulator Component
    const simContainer = document.getElementById('frameSimContainer');
    this.simulator = new FrameSimulator(simContainer);

    // 2. Initialize NFC Modal Component
    const modalEl = document.getElementById('nfcModal');
    this.nfcModal = new NFCModal(modalEl, {
      onFlashSuccess: (meta) => {
        console.log('NFC Flash completed:', meta);
        recordFlashTelemetry({
          device_uid: meta.deviceUid,
          frame_bytes: meta.payloadSize,
          preset_id: this.state.selectedPreset?.id || 'none',
          status: 'success'
        });
        // Trigger simulated hardware refresh
        const ditherResult = this.computeDither();
        if (ditherResult) {
          this.simulator.triggerWaveformRefresh(ditherResult.imageData);
        }
      }
    });

    // 3. Load presets
    await this.loadPresets();

    // 4. Bind UI event listeners
    this.bindEvents();

    // 5. Load default image
    await this.loadImage(this.state.imageSrc);
  }

  async loadPresets() {
    const shelf = document.getElementById('filmShelfContainer');
    shelf.innerHTML = '<div style="color: var(--color-text-secondary); padding: 12px;">加载胶片预设库...</div>';

    try {
      this.state.presets = await fetchFilters();
    } catch (e) {
      console.error('Failed to load presets:', e);
      this.state.presets = [];
    }

    shelf.innerHTML = '';

    if (!this.state.presets.length) {
      shelf.innerHTML = '<div style="color: var(--color-text-secondary);">暂无预设</div>';
      return;
    }

    // Default select Polaroid 600
    this.state.selectedPreset = this.state.presets.find(p => p.id === 'polaroid_600') || this.state.presets[0];

    this.state.presets.forEach((preset, idx) => {
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
    // Quick sample photo switchers
    const sampleSunset = document.getElementById('sampleSunset');
    const samplePortrait = document.getElementById('samplePortrait');
    const sampleStreet = document.getElementById('sampleStreet');

    const setSampleActive = (btn, src) => {
      [sampleSunset, samplePortrait, sampleStreet].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.loadImage(src);
    };

    if (sampleSunset) sampleSunset.addEventListener('click', () => setSampleActive(sampleSunset, 'assets/samples/sunset.png'));
    if (samplePortrait) samplePortrait.addEventListener('click', () => setSampleActive(samplePortrait, 'assets/samples/portrait.png'));
    if (sampleStreet) sampleStreet.addEventListener('click', () => setSampleActive(sampleStreet, 'assets/samples/street.png'));

    // Upload photo
    const fileInput = document.getElementById('fileUploadInput');
    const btnUpload = document.getElementById('btnUploadPhoto');
    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            [sampleSunset, samplePortrait, sampleStreet].forEach(b => b.classList.remove('active'));
            this.loadImage(evt.target.result);
          };
          reader.readAsDataURL(e.target.files[0]);
        }
      });
    }

    // Drag and drop photo onto main stage
    const dropZone = document.querySelector('.main-stage');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (evt) => this.loadImage(evt.target.result);
            reader.readAsDataURL(file);
          }
        }
      });
    }

    // Dither algorithm toggle (Atkinson vs Floyd-Steinberg)
    const btnAtkinson = document.getElementById('btnAtkinson');
    const btnFloyd = document.getElementById('btnFloyd');
    if (btnAtkinson && btnFloyd) {
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
    }

    // Frame style toggle (Polaroid White Border vs Full Bleed)
    const btnFramePolaroid = document.getElementById('btnFramePolaroid');
    const btnFrameFull = document.getElementById('btnFrameFull');
    if (btnFramePolaroid && btnFrameFull) {
      btnFramePolaroid.addEventListener('click', () => {
        btnFramePolaroid.classList.add('active');
        btnFrameFull.classList.remove('active');
        this.state.frameTemplate = 'polaroid';
        this.renderPipeline(false);
      });
      btnFrameFull.addEventListener('click', () => {
        btnFrameFull.classList.add('active');
        btnFramePolaroid.classList.remove('active');
        this.state.frameTemplate = 'full';
        this.renderPipeline(false);
      });
    }

    // Red-damper slider
    const sliderRedDamper = document.getElementById('sliderRedDamper');
    const valRedDamper = document.getElementById('valRedDamper');
    if (sliderRedDamper) {
      sliderRedDamper.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.state.redDamper = val;
        valRedDamper.textContent = val.toFixed(2);
        this.renderPipeline(false);
      });
    }

    // Contrast slider
    const sliderContrast = document.getElementById('sliderContrast');
    const valContrast = document.getElementById('valContrast');
    if (sliderContrast) {
      sliderContrast.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.state.contrast = val;
        valContrast.textContent = val.toFixed(2);
        this.renderPipeline(false);
      });
    }

    // NFC Flash CTA button
    const btnTriggerFlash = document.getElementById('btnTriggerFlash');
    if (btnTriggerFlash) {
      btnTriggerFlash.addEventListener('click', () => {
        if (!this.state.packed30kPayload) {
          this.renderPipeline(false);
        }
        this.nfcModal.open(this.state.packed30kPayload);
      });
    }

    // Export .bin button in inspector
    const btnExportBin = document.getElementById('btnExportBin');
    if (btnExportBin) {
      btnExportBin.addEventListener('click', () => {
        if (this.state.packed30kPayload) {
          const filmName = this.state.selectedPreset?.id || 'standard';
          downloadBinaryFile(this.state.packed30kPayload, `eink_${filmName}_400x300.bin`);
        }
      });
    }

    // Export .png button in inspector
    const btnExportPng = document.getElementById('btnExportPng');
    if (btnExportPng) {
      btnExportPng.addEventListener('click', () => {
        const filmName = this.state.selectedPreset?.id || 'standard';
        downloadCanvasAsPNG(this.simulator.canvas, `eink_${filmName}_preview.png`);
      });
    }
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
   * Main Photographic & E-Ink Processing Pipeline
   */
  async renderPipeline(triggerWaveformAnimation = false) {
    if (!this.state.currentImage) return;

    const ctx = this.offCtx;
    ctx.clearRect(0, 0, 400, 300);

    // 1. Draw image with framing
    if (this.state.frameTemplate === 'polaroid') {
      // Polaroid classic framing (White border: Top 16, Left/Right 16, Bottom 46)
      ctx.fillStyle = '#F5F2EB'; // E-ink paper white border
      ctx.fillRect(0, 0, 400, 300);

      const photoX = 16;
      const photoY = 16;
      const photoW = 400 - 32; // 368
      const photoH = 300 - 62; // 238

      this.drawImageCover(ctx, this.state.currentImage, photoX, photoY, photoW, photoH);

      // Subtitle engraving in Polaroid bottom margin
      ctx.fillStyle = '#181818';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      const presetTitle = this.state.selectedPreset ? this.state.selectedPreset.name : 'RNI ALL FILMS 5';
      ctx.fillText(`${presetTitle.toUpperCase()} · 2026`, 200, 278);
    } else {
      // Full bleed 400x300
      this.drawImageCover(ctx, this.state.currentImage, 0, 0, 400, 300);
    }

    // Set original preview in split comparison
    this.simulator.setOriginalImage(this.offscreenCanvas);

    // 2. Fetch raw image pixels
    let currentPixels = ctx.getImageData(0, 0, 400, 300);

    // 3. Apply 3D Film LUT if selected
    if (this.state.selectedPreset && this.state.selectedPreset.cube_file) {
      try {
        const cubeUrl = `presets/cube/${this.state.selectedPreset.cube_file}`;
        const lut = await loadCubeLUT(cubeUrl);
        currentPixels = applyLUTToImageData(lut, currentPixels, 1.0);
      } catch (err) {
        console.warn('LUT apply failed, applying parametric grade:', err);
        currentPixels = applyParametricAdjustments(currentPixels, {
          contrast: this.state.contrast,
          saturation: this.state.saturation,
          warmth: 0.1
        });
      }
    } else {
      currentPixels = applyParametricAdjustments(currentPixels, {
        contrast: this.state.contrast,
        saturation: this.state.saturation
      });
    }

    // 4. Quantize & Dither to 4 E-Ink colors
    let ditherResult;
    if (this.state.ditherAlgorithm === 'atkinson') {
      ditherResult = ditherAtkinson(currentPixels, this.state.redDamper);
    } else {
      ditherResult = ditherFloydSteinberg(currentPixels, this.state.redDamper);
    }

    // 5. Pack into 30,000 bytes
    this.state.packed30kPayload = pack2BitMSB(ditherResult.indices);

    // 6. Update Hardware Display Canvas
    this.simulator.renderDitheredImage(ditherResult.imageData, triggerWaveformAnimation);

    // 7. Update Histogram Stats in Inspector
    this.updateHistogramUI(ditherResult.stats);
  }

  computeDither() {
    const pixels = this.offCtx.getImageData(0, 0, 400, 300);
    if (this.state.ditherAlgorithm === 'atkinson') {
      return ditherAtkinson(pixels, this.state.redDamper);
    }
    return ditherFloydSteinberg(pixels, this.state.redDamper);
  }

  drawImageCover(ctx, img, targetX, targetY, targetW, targetH) {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const srcAspect = srcW / srcH;
    const targetAspect = targetW / targetH;

    let renderW, renderH, cropX, cropY;

    if (srcAspect > targetAspect) {
      renderH = srcH;
      renderW = srcH * targetAspect;
      cropX = (srcW - renderW) / 2;
      cropY = 0;
    } else {
      renderW = srcW;
      renderH = srcW / targetAspect;
      cropX = 0;
      cropY = (srcH - renderH) / 2;
    }

    ctx.drawImage(img, cropX, cropY, renderW, renderH, targetX, targetY, targetW, targetH);
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

// Bootstrap when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new EinkApp();
  app.init().catch(console.error);
});
