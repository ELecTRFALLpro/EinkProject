/**
 * EinkProject iOS Darkroom App Controller
 * Spotify Dark Theme · Touch Gestures · 3D LUTs · User Auth & History Photos
 */

import { FrameSimulator } from './components/frame_simulator.js';
import { NFCModal } from './components/nfc_modal.js';
import { ditherAtkinson, ditherFloydSteinberg } from './engine/dither.js';
import { pack2BitMSB, unpack2BitMSB } from './engine/packer.js';
import { loadCubeLUT, applyLUTToImageData, applyParametricAdjustments } from './engine/lut.js';
import {
  fetchFilters,
  recordFlashTelemetry,
  isLoggedIn,
  getCurrentUser,
  sendSMS,
  loginBySMS,
  logout,
  fetchProfile,
  fetchMyArtworks,
  createArtwork,
  deleteArtwork,
  uploadImageFile
} from './api.js';

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
      presets: [],
      currentUser: null
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

    // 1. Initialize Frame Simulator with Touch Pan & Zoom
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
      onFlashSuccess: async (meta) => {
        recordFlashTelemetry({
          device_uid: meta.deviceUid,
          frame_bytes: meta.payloadSize,
          preset_id: this.state.selectedPreset?.id || 'none',
          status: 'success'
        });

        // Auto archive to history on successful flash
        await this.saveCurrentArtworkToHistory('刷屏记录');

        const ditherResult = this.computeDither();
        if (ditherResult) {
          this.simulator.triggerWaveformRefresh(ditherResult.imageData);
        }
      }
    });

    // 3. Check User Login State
    this.updateUserAuthUI();
    if (isLoggedIn()) {
      fetchProfile().then(u => {
        if (u) {
          this.state.currentUser = u;
          this.updateUserAuthUI();
        }
      });
    }

    // 4. Load presets & bind events
    await this.loadPresets();
    this.bindEvents();
    this.bindAuthAndHistoryEvents();

    // 5. Load initial sample
    await this.loadImage(this.state.imageSrc);
  }

  // --- User Auth UI Updates ---
  updateUserAuthUI() {
    const user = getCurrentUser();
    this.state.currentUser = user;
    const btnAuth = document.getElementById('btnUserAuth');

    if (user && user.nickname) {
      btnAuth.className = 'user-pill';
      btnAuth.innerHTML = `
        <span class="user-avatar-mini">${user.nickname.slice(0, 1) || '用'}</span>
        <span class="user-name-txt">${user.nickname}</span>
      `;
    } else {
      btnAuth.className = 'ios-icon-btn';
      btnAuth.innerHTML = `👤 登录`;
    }
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

    // Split View & Texture Toggles
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

    // Reset Tones
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

    // Upload photo from device
    const fileInput = document.getElementById('fileUploadInput');
    document.getElementById('btnUploadPhoto').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        // 1. Try uploading to backend /v1/upload if online
        try {
          const res = await uploadImageFile(file);
          if (res && res.url) {
            this.state.imageSrc = res.url;
          }
        } catch (err) {
          console.warn('Backend file upload skipped, using local DataURL:', err.message);
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
          this.resetTransform();
          if (!this.state.imageSrc || !this.state.imageSrc.startsWith('/uploads')) {
            this.state.imageSrc = evt.target.result;
          }
          this.loadImage(evt.target.result);
        };
        reader.readAsDataURL(file);
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
      this.state.imageSrc = src;
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

    // Save to History Button
    document.getElementById('btnSaveToHistory').addEventListener('click', async () => {
      const btn = document.getElementById('btnSaveToHistory');
      btn.textContent = '⏳ 保存中...';
      try {
        await this.saveCurrentArtworkToHistory();
        btn.textContent = '✓ 已存入相册';
        setTimeout(() => { btn.textContent = '💾 存入相册'; }, 2000);
      } catch (err) {
        alert('保存失败: ' + err.message);
        btn.textContent = '💾 存入相册';
      }
    });
  }

  // --- Auth & History Dialog Event Listeners ---
  bindAuthAndHistoryEvents() {
    const loginModal = document.getElementById('loginModal');
    const profileModal = document.getElementById('profileModal');
    const historyModal = document.getElementById('historyModal');

    // 1. Top bar Auth button click
    document.getElementById('btnUserAuth').addEventListener('click', () => {
      if (isLoggedIn()) {
        const user = getCurrentUser();
        document.getElementById('profileNickname').textContent = user.nickname || '摄影师';
        document.getElementById('profilePhone').textContent = user.phone || '未绑定';
        document.getElementById('profileAvatar').textContent = user.nickname?.slice(0, 1) || '👤';
        profileModal.showModal();
      } else {
        loginModal.showModal();
      }
    });

    document.getElementById('btnCloseLoginModal').addEventListener('click', () => loginModal.close());
    document.getElementById('btnCloseProfileModal').addEventListener('click', () => profileModal.close());
    document.getElementById('btnCloseHistoryModal').addEventListener('click', () => historyModal.close());

    // 2. Send SMS Code
    const btnSendSMS = document.getElementById('btnSendSMS');
    btnSendSMS.addEventListener('click', async () => {
      const phone = document.getElementById('inputPhone').value.trim();
      if (!phone || phone.length < 11) {
        alert('请输入有效的11位手机号');
        return;
      }
      btnSendSMS.disabled = true;
      try {
        await sendSMS(phone);
        let seconds = 60;
        btnSendSMS.textContent = `${seconds}s`;
        const timer = setInterval(() => {
          seconds--;
          if (seconds <= 0) {
            clearInterval(timer);
            btnSendSMS.disabled = false;
            btnSendSMS.textContent = '获取验证码';
          } else {
            btnSendSMS.textContent = `${seconds}s`;
          }
        }, 1000);
      } catch (err) {
        alert(err.message);
        btnSendSMS.disabled = false;
        btnSendSMS.textContent = '获取验证码';
      }
    });

    // 3. Submit Login
    document.getElementById('btnSubmitLogin').addEventListener('click', async () => {
      const phone = document.getElementById('inputPhone').value.trim();
      const code = document.getElementById('inputSMSCode').value.trim();
      if (!phone || !code) {
        alert('手机号和验证码不能为空');
        return;
      }

      const submitBtn = document.getElementById('btnSubmitLogin');
      submitBtn.disabled = true;
      submitBtn.textContent = '正在登录...';

      try {
        const { user } = await loginBySMS(phone, code);
        this.updateUserAuthUI();
        loginModal.close();
        alert(`欢迎回来，${user.nickname}！云端相册与历史记录已同步。`);
      } catch (err) {
        alert('登录失败: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '登 录';
      }
    });

    // 4. Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
      logout();
      this.updateUserAuthUI();
      profileModal.close();
      alert('已退出当前账号');
    });

    // 5. Open History Gallery
    document.getElementById('btnOpenHistory').addEventListener('click', () => {
      this.renderHistoryList();
      historyModal.showModal();
    });
  }

  // --- Save Current Artwork to History ---
  async saveCurrentArtworkToHistory(customTitle = '') {
    if (!this.simulator.canvas) return;

    // 1. Get 400x300 preview DataURL
    const previewDataUrl = this.simulator.canvas.toDataURL('image/png');

    // 2. Base64 30KB bitmap
    let bitmapB64 = '';
    if (this.state.packed30kPayload) {
      let binary = '';
      const len = this.state.packed30kPayload.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(this.state.packed30kPayload[i]);
      }
      bitmapB64 = btoa(binary);
    }

    // 3. Serialize all transform and tonal parameters
    const params = {
      rotation: this.state.rotation,
      flipH: this.state.flipH,
      zoom: this.state.zoom,
      panX: this.state.panX,
      panY: this.state.panY,
      brightness: this.state.brightness,
      contrast: this.state.contrast,
      saturation: this.state.saturation,
      warmth: this.state.warmth,
      sharpness: this.state.sharpness,
      redDamper: this.state.redDamper,
      imageSrc: this.state.imageSrc
    };

    const presetName = this.state.selectedPreset?.name || '经典微调';
    const title = customTitle || `${presetName} 创作照片`;

    return await createArtwork({
      title,
      subtitle: `${presetName.toUpperCase()} · 400x300`,
      original_image_url: this.state.imageSrc,
      rendered_preview_url: previewDataUrl,
      bitmap_base64: bitmapB64,
      filter_id: this.state.selectedPreset?.id || 'polaroid_600',
      frame_id: this.state.frameTemplate,
      dither_method: this.state.ditherAlgorithm,
      params_json: JSON.stringify(params),
      target_device_id: 'dev_eink_401'
    });
  }

  // --- Render History Gallery Modal Content ---
  async renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    const countBadge = document.getElementById('historyCountBadge');
    container.innerHTML = '<div style="color: var(--color-text-secondary); text-align: center; padding: 30px;">加载历史照片记录...</div>';

    const { artworks } = await fetchMyArtworks();
    countBadge.textContent = `${artworks.length} 张`;
    container.innerHTML = '';

    if (!artworks || artworks.length === 0) {
      container.innerHTML = `
        <div class="history-empty-state">
          <div class="history-empty-icon">🖼️</div>
          <div style="font-size: 15px; font-weight: 700; color: #FFFFFF;">暂无历史照片记录</div>
          <p style="font-size: 12px; max-width: 260px; line-height: 1.5;">
            在暗室完成调色后点击「💾 存入相册」或烧录至相框，即可随时在这里查阅和一键载入恢复！
          </p>
        </div>
      `;
      return;
    }

    artworks.forEach((art) => {
      const card = document.createElement('div');
      card.className = 'history-item-card';

      const thumbUrl = art.rendered_preview_url || art.original_image_url || 'assets/samples/sunset.png';
      const dateStr = art.created_at ? new Date(art.created_at).toLocaleDateString() : '近日';
      const filterTag = (art.filter_id || 'RNI FILM').toUpperCase();

      card.innerHTML = `
        <div class="history-item-thumb">
          <img src="${thumbUrl}" alt="${art.title}">
        </div>
        <div class="history-item-info">
          <span class="history-item-title">${art.title || '无标题作品'}</span>
          <div class="history-item-meta">
            <span class="badge badge-film">${filterTag}</span>
            <span>📅 ${dateStr}</span>
            ${art.flashed_count > 0 ? `<span style="color: var(--color-accent-primary);">⚡ 已刷 ${art.flashed_count} 次</span>` : ''}
          </div>
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn primary btn-restore" title="恢复当时的图片与调色参数">
            载入暗室
          </button>
          <button class="history-action-btn delete btn-delete" title="删除该记录">
            删除
          </button>
        </div>
      `;

      // 1. Restore to Darkroom Studio
      card.querySelector('.btn-restore').addEventListener('click', async () => {
        document.getElementById('historyModal').close();
        await this.restoreArtwork(art);
      });

      // 2. Delete Artwork
      card.querySelector('.btn-delete').addEventListener('click', async () => {
        if (confirm(`确定要删除历史照片「${art.title}」吗？`)) {
          await deleteArtwork(art.id);
          this.renderHistoryList();
        }
      });

      container.appendChild(card);
    });
  }

  // --- Restore Artwork into Studio ---
  async restoreArtwork(art) {
    console.log('Restoring artwork:', art);

    // 1. Restore Frame Template & Dither algorithm
    if (art.frame_id) {
      this.state.frameTemplate = art.frame_id;
      document.getElementById('btnFramePolaroid').classList.toggle('active', art.frame_id === 'polaroid');
      document.getElementById('btnFrameFull').classList.toggle('active', art.frame_id === 'full');
    }

    if (art.dither_method) {
      this.state.ditherAlgorithm = art.dither_method;
      document.getElementById('btnAtkinson').classList.toggle('active', art.dither_method === 'atkinson');
      document.getElementById('btnFloyd').classList.toggle('active', art.dither_method === 'floyd');
    }

    // 2. Restore Filter Preset
    if (art.filter_id && this.state.presets) {
      const match = this.state.presets.find(p => p.id === art.filter_id);
      if (match) {
        this.state.selectedPreset = match;
        document.querySelectorAll('.film-card').forEach(c => {
          c.classList.toggle('active', c.dataset.id === match.id);
        });
      }
    }

    // 3. Restore Parameters from params_json
    let loadedImageSrc = art.original_image_url || art.rendered_preview_url || 'assets/samples/sunset.png';
    if (art.params_json) {
      try {
        const p = JSON.parse(art.params_json);
        if (p.rotation !== undefined) this.state.rotation = p.rotation;
        if (p.flipH !== undefined) {
          this.state.flipH = p.flipH;
          document.getElementById('btnFlipH').classList.toggle('active', p.flipH);
        }
        if (p.zoom !== undefined) this.state.zoom = p.zoom;
        if (p.panX !== undefined) this.state.panX = p.panX;
        if (p.panY !== undefined) this.state.panY = p.panY;
        if (p.imageSrc) loadedImageSrc = p.imageSrc;

        // Tones
        if (p.brightness !== undefined) {
          this.state.brightness = p.brightness;
          document.getElementById('sliderBrightness').value = p.brightness;
          document.getElementById('valBrightness').textContent = p.brightness;
        }
        if (p.contrast !== undefined) {
          this.state.contrast = p.contrast;
          document.getElementById('sliderContrast').value = p.contrast;
          document.getElementById('valContrast').textContent = p.contrast.toFixed(2);
        }
        if (p.saturation !== undefined) {
          this.state.saturation = p.saturation;
          document.getElementById('sliderSaturation').value = p.saturation;
          document.getElementById('valSaturation').textContent = p.saturation.toFixed(2);
        }
        if (p.warmth !== undefined) {
          this.state.warmth = p.warmth;
          document.getElementById('sliderWarmth').value = p.warmth;
          document.getElementById('valWarmth').textContent = p.warmth;
        }
        if (p.sharpness !== undefined) {
          this.state.sharpness = p.sharpness;
          const sPct = Math.round(p.sharpness * 100);
          document.getElementById('sliderSharpness').value = sPct;
          document.getElementById('valSharpness').textContent = `${sPct}%`;
        }
        if (p.redDamper !== undefined) {
          this.state.redDamper = p.redDamper;
          document.getElementById('sliderRedDamper').value = p.redDamper;
          document.getElementById('valRedDamper').textContent = p.redDamper.toFixed(2);
        }
      } catch (e) {
        console.warn('Failed to parse artwork params_json:', e);
      }
    }

    // 4. Load Image and Render
    this.state.imageSrc = loadedImageSrc;
    await this.loadImage(loadedImageSrc);
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

  renderTransformedImage(ctx, img, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    const isRotated90 = (this.state.rotation === 90 || this.state.rotation === 270);
    const effectiveW = isRotated90 ? imgH : imgW;
    const effectiveH = isRotated90 ? imgW : imgH;

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
