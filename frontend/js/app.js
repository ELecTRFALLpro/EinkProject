/**
 * EinkProject iOS Darkroom App Controller
 * Spotify Dark Theme · 60fps RAF Touch Gestures · 3D LUTs · Device Center · User Auth & History Photos
 */

import { FrameSimulator } from './components/frame_simulator.js';
import { NFCModal } from './components/nfc_modal.js';
import { ditherAtkinson, ditherFloydSteinberg, ditherOrderedBayer } from './engine/dither.js';
import { pack2BitMSB } from './engine/packer.js';
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
  updateUserProfile,
  getActiveDevice,
  setActiveDevice,
  fetchMyDevices,
  activateDevice,
  unbindDevice,
  fetchMyArtworks,
  createArtwork,
  updateArtworkTitle,
  recordArtworkFlashed,
  deleteArtwork,
  uploadImageFile
} from './api.js';

class EinkApp {
  constructor() {
    this.state = {
      imageSrc: 'assets/samples/sunset.png',
      currentImage: null,
      selectedPreset: null,
      activeCategory: 'all',
      ditherAlgorithm: 'atkinson', // 'atkinson' | 'floyd' | 'bayer'
      frameTemplate: 'polaroid',   // 'polaroid' | 'postcard' | 'gallery' | 'full'
      customSubtitle: '',

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
      currentUser: null,
      lastSavedArtworkId: null
    };

    this.simulator = null;
    this.nfcModal = null;
    this.rafPending = false;
    this.toastTimer = null;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 400;
    this.offscreenCanvas.height = 300;
    this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  async init() {
    // 1. Initialize Frame Simulator with 60fps RAF-throttled Touch Pan, Pinch Zoom & Double-Tap
    const simContainer = document.getElementById('frameSimContainer');
    this.simulator = new FrameSimulator(simContainer, {
      onPan: (dx, dy) => {
        this.state.panX += dx;
        this.state.panY += dy;
        this.syncTransformUI();
        this.scheduleRender();
      },
      onZoomDelta: (delta) => {
        this.state.zoom = Math.min(3.5, Math.max(1.0, this.state.zoom + delta));
        this.syncTransformUI();
        this.scheduleRender();
      },
      onDoubleTap: () => {
        if (this.state.zoom > 1.05 || Math.abs(this.state.panX) > 4 || Math.abs(this.state.panY) > 4) {
          this.state.zoom = 1.0;
          this.state.panX = 0;
          this.state.panY = 0;
          this.showToast('🔍 已恢复 1.0x 标准构图');
        } else {
          this.state.zoom = 1.8;
          this.showToast('🔍 已放大至 1.8x 局部构图');
        }
        this.syncTransformUI();
        this.scheduleRender();
      },
      onResetTransform: () => {
        this.resetTransform();
        this.scheduleRender();
        this.showToast('↺ 构图与旋转已复位');
      }
    });

    // 2. Initialize NFC Flash Modal
    const modalEl = document.getElementById('nfcModal');
    this.nfcModal = new NFCModal(modalEl, {
      onFlashSuccess: async (meta) => {
        // Send telemetry matching backend model.FlashLog schema
        recordFlashTelemetry({
          device_id: meta.deviceId || getActiveDevice()?.id || 'dev_demo_401a',
          result: 'success',
          duration_ms: meta.durationMs || 1500,
          chunks: meta.chunks || 125,
          platform: 'ios',
          phone_model: 'iPhone',
          os_version: 'iOS 18',
          app_version: '1.2.0'
        });

        // Auto archive or increment flash count on history
        const saved = await this.saveCurrentArtworkToHistory('NFC 刷屏记录', 1);
        if (saved && saved.id) {
          await recordArtworkFlashed(saved.id, meta.deviceId);
        }

        this.updateActiveDevicePill();
        this.showToast('⚡ 30KB 墨水屏烧录成功并已存入历史相册');

        const ditherResult = this.computeDither();
        if (ditherResult) {
          this.simulator.triggerWaveformRefresh(ditherResult.imageData);
        }
      }
    });

    // 3. Check User Login State & Active Device Pill
    this.updateUserAuthUI();
    this.updateActiveDevicePill();
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
    this.initAllSliderProgressTracks();

    // 5. Load initial sample
    await this.loadImage(this.state.imageSrc);
  }

  // --- Dynamic Island Toast ---
  showToast(msg, duration = 2200) {
    const el = document.getElementById('iosToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, duration);
  }

  // --- RAF Coalesced Render Scheduler (Prevents Main Thread Blocking on Rapid Touch/Slider) ---
  scheduleRender() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.renderPipeline(false);
    });
  }

  syncTransformUI() {
    if (this.simulator) {
      this.simulator.updateTransformBadge({
        zoom: this.state.zoom,
        panX: this.state.panX,
        panY: this.state.panY,
        rotation: this.state.rotation,
        flipH: this.state.flipH
      });
    }
  }

  updateActiveDevicePill() {
    const dev = getActiveDevice();
    const txtEl = document.getElementById('navActiveDeviceText');
    if (txtEl && dev) {
      txtEl.textContent = dev.nickname || '4.01" NFC 就绪';
    }
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
    shelf.innerHTML = '<div style="color: var(--color-text-secondary); padding: 12px; font-size: 12px;">加载 RNI 胶片库...</div>';

    try {
      this.state.presets = await fetchFilters();
    } catch (e) {
      console.error('Failed to load presets:', e);
      this.state.presets = [];
    }

    if (!this.state.presets.length) return;
    this.state.selectedPreset = this.state.presets.find(p => p.id === 'polaroid_600') || this.state.presets[0];
    this.renderFilmShelf();
  }

  renderFilmShelf() {
    const shelf = document.getElementById('filmShelfContainer');
    shelf.innerHTML = '';

    const cat = this.state.activeCategory;
    const filtered = this.state.presets.filter(p => {
      if (cat === 'all') return true;
      if (cat === 'mono') return p.category === 'mono' || p.category === 'vintage';
      return p.category === cat;
    });

    filtered.forEach((preset) => {
      const card = document.createElement('div');
      const isSelected = this.state.selectedPreset && preset.id === this.state.selectedPreset.id;
      card.className = `film-card ${isSelected ? 'active' : ''}`;
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
          <img src="assets/thumbs/${preset.id}.png" alt="${preset.name}" width="102" height="64" loading="lazy">
        </div>
        <div class="film-card-info">
          <span class="film-card-name" title="${preset.name}">${preset.name}</span>
          <span class="badge ${badgeClass} film-card-tag">${brandTag}</span>
        </div>
        <div class="film-card-active-check">✓</div>
      `;

      card.addEventListener('click', () => {
        shelf.querySelectorAll('.film-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.state.selectedPreset = preset;

        // Smoothly center the selected card inside the horizontal shelf without scrolling the page
        const shelfRect = shelf.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const offset = (cardRect.left + cardRect.width / 2) - (shelfRect.left + shelfRect.width / 2);
        shelf.scrollBy({ left: offset, behavior: 'smooth' });

        this.scheduleRender();
      });

      shelf.appendChild(card);
    });
  }

  switchTab(targetTabId) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === targetTabId));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === targetTabId);
    });
  }

  bindEvents() {
    // 1. Segmented Tab Bar Clicks
    const tabIds = ['tabPresets', 'tabToning', 'tabFraming'];
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // 2. Horizontal Swipe on Bottom Drawer to Switch Tabs (excluding sliders & horizontal film scroller)
    const drawer = document.getElementById('tabDrawerWrapper');
    let touchStartX = 0;
    let touchStartY = 0;
    let ignoreDrawerSwipe = false;

    drawer.addEventListener('touchstart', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || e.target.closest('.film-shelf-scroll') || e.target.closest('.film-category-bar')) {
        ignoreDrawerSwipe = true;
        return;
      }
      ignoreDrawerSwipe = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    drawer.addEventListener('touchend', (e) => {
      if (ignoreDrawerSwipe || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const activeBtn = document.querySelector('.tab-btn.active');
        const curIdx = tabIds.indexOf(activeBtn?.dataset.tab || 'tabPresets');
        if (dx < 0 && curIdx < tabIds.length - 1) {
          this.switchTab(tabIds[curIdx + 1]);
        } else if (dx > 0 && curIdx > 0) {
          this.switchTab(tabIds[curIdx - 1]);
        }
      }
    }, { passive: true });

    // 3. Film Category Filter Chips
    const catChips = document.querySelectorAll('#filmCategoryBar .cat-chip');
    catChips.forEach(chip => {
      chip.addEventListener('click', () => {
        catChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.state.activeCategory = chip.dataset.cat;
        this.renderFilmShelf();
      });
    });

    // 4. Transform controls: Rotate CCW / CW / Flip
    document.getElementById('btnRotateCCW').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      this.syncTransformUI();
      this.scheduleRender();
    });

    document.getElementById('btnRotateCW').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      this.syncTransformUI();
      this.scheduleRender();
    });

    document.getElementById('btnFlipH').addEventListener('click', () => {
      this.state.flipH = !this.state.flipH;
      document.getElementById('btnFlipH').classList.toggle('active', this.state.flipH);
      this.syncTransformUI();
      this.scheduleRender();
    });

    // 5. Split View & Texture Toggles
    const btnSplit = document.getElementById('btnToggleSplit');
    btnSplit.addEventListener('click', () => {
      const enabled = !btnSplit.classList.contains('active');
      btnSplit.classList.toggle('active', enabled);
      this.simulator.toggleSplit(enabled);
      if (enabled) this.showToast('◨ 已开启原图与墨水屏分屏对比');
    });

    const btnTexture = document.getElementById('btnToggleTexture');
    btnTexture.addEventListener('click', () => {
      const enabled = !btnTexture.classList.contains('active');
      btnTexture.classList.toggle('active', enabled);
      this.simulator.toggleTexture(enabled);
    });

    // 6. Reset Tones
    document.getElementById('btnResetTone').addEventListener('click', () => {
      this.resetTones();
      this.scheduleRender();
      this.showToast('🎨 全部影调参数已恢复默认');
    });

    // 7. Sliders with Live Fill Track & Double-Tap Individual Reset
    this.bindSlider('sliderBrightness', 'valBrightness', 0, (v) => { this.state.brightness = v; }, (v) => v);
    this.bindSlider('sliderContrast', 'valContrast', 1.20, (v) => { this.state.contrast = v; }, (v) => v.toFixed(2));
    this.bindSlider('sliderSaturation', 'valSaturation', 1.15, (v) => { this.state.saturation = v; }, (v) => v.toFixed(2));
    this.bindSlider('sliderWarmth', 'valWarmth', 0, (v) => { this.state.warmth = v; }, (v) => v);
    this.bindSlider('sliderSharpness', 'valSharpness', 40, (v) => { this.state.sharpness = v / 100; }, (v) => `${v}%`);
    this.bindSlider('sliderRedDamper', 'valRedDamper', 1.15, (v) => { this.state.redDamper = v; }, (v) => v.toFixed(2));

    // 8. 4 Frame Template Buttons & Custom Caption Input
    const frameBtns = document.querySelectorAll('[data-frame]');
    const captionRow = document.getElementById('captionEditRow');
    frameBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        frameBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.frameTemplate = btn.dataset.frame;
        if (captionRow) {
          const hasCaption = (this.state.frameTemplate === 'polaroid' || this.state.frameTemplate === 'postcard');
          captionRow.style.opacity = hasCaption ? '1' : '0.4';
        }
        this.scheduleRender();
      });
    });

    const subtitleInput = document.getElementById('inputFrameSubtitle');
    if (subtitleInput) {
      subtitleInput.addEventListener('input', (e) => {
        this.state.customSubtitle = e.target.value;
        this.scheduleRender();
      });
    }

    // 9. 3 Dithering Mode Buttons (Atkinson / Floyd / Bayer)
    const ditherBtns = document.querySelectorAll('[data-dither]');
    ditherBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        ditherBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.ditherAlgorithm = btn.dataset.dither;
        this.scheduleRender();
      });
    });

    // 10. Upload photo from device
    const fileInput = document.getElementById('fileUploadInput');
    document.getElementById('btnUploadPhoto').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        this.showToast('📷 正在载入相片...');
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
          this.showToast('✨ 相片载入完成，可拖拽或双指缩放构图');
        };
        reader.readAsDataURL(file);
      }
    });

    // 11. Sample Picker Action Sheet
    const sampleSheet = document.getElementById('sampleSheet');
    document.getElementById('btnOpenSamples').addEventListener('click', () => {
      sampleSheet.showModal();
    });

    const selectSample = (src, label) => {
      sampleSheet.close();
      this.resetTransform();
      this.state.imageSrc = src;
      this.loadImage(src);
      this.showToast(`✨ 已切换样张：${label}`);
    };

    document.getElementById('sheetSunset').addEventListener('click', () => selectSample('assets/samples/sunset.png', '落日余晖'));
    document.getElementById('sheetPortrait').addEventListener('click', () => selectSample('assets/samples/portrait.png', '胶片人像'));
    document.getElementById('sheetStreet').addEventListener('click', () => selectSample('assets/samples/street.png', '复古街景'));

    // 12. Waveform refresh simulation button
    document.getElementById('btnTriggerRefresh').addEventListener('click', () => {
      const ditherResult = this.computeDither();
      if (ditherResult) {
        this.simulator.triggerWaveformRefresh(ditherResult.imageData);
      }
    });

    // 13. NFC Flash CTA
    document.getElementById('btnTriggerFlash').addEventListener('click', () => {
      if (!this.state.packed30kPayload) {
        this.renderPipeline(false);
      }
      this.nfcModal.open(this.state.packed30kPayload);
    });

    // 14. Save to History Button
    document.getElementById('btnSaveToHistory').addEventListener('click', async () => {
      const btn = document.getElementById('btnSaveToHistory');
      btn.textContent = '⏳ 保存中...';
      try {
        await this.saveCurrentArtworkToHistory();
        btn.textContent = '✓ 已存入';
        this.showToast('💾 作品及暗室调色参数已存入历史相册');
        setTimeout(() => { btn.textContent = '💾 存入相册'; }, 1800);
      } catch (err) {
        this.showToast('⚠️ 保存失败: ' + err.message);
        btn.textContent = '💾 存入相册';
      }
    });
  }

  // --- Auth, Profile & Hardware Device Center Event Listeners ---
  bindAuthAndHistoryEvents() {
    const loginModal = document.getElementById('loginModal');
    const profileModal = document.getElementById('profileModal');
    const historyModal = document.getElementById('historyModal');

    const openProfileOrDevices = async () => {
      const user = getCurrentUser();
      document.getElementById('inputProfileNickname').value = user?.nickname || '胶片摄影师';
      document.getElementById('profilePhone').textContent = user?.phone ? `+86 ${user.phone}` : '离线体验模式（点击登录可同步云端）';
      document.getElementById('profileAvatar').textContent = user?.nickname?.slice(0, 1) || '👤';
      await this.renderBoundDevicesList();
      profileModal.showModal();
    };

    // Top bar Auth button click
    document.getElementById('btnUserAuth').addEventListener('click', () => {
      if (isLoggedIn()) {
        openProfileOrDevices();
      } else {
        loginModal.showModal();
      }
    });

    // Top bar Device Pill click -> opens Hardware Device Center directly
    document.getElementById('deviceStatusPill').addEventListener('click', () => {
      openProfileOrDevices();
    });

    document.getElementById('btnCloseLoginModal').addEventListener('click', () => loginModal.close());
    document.getElementById('btnCloseProfileModal').addEventListener('click', () => profileModal.close());
    document.getElementById('btnCloseHistoryModal').addEventListener('click', () => historyModal.close());

    // Save User Nickname
    document.getElementById('btnSaveNickname').addEventListener('click', async () => {
      const newName = document.getElementById('inputProfileNickname').value.trim();
      if (!newName) {
        this.showToast('⚠️ 昵称不能为空');
        return;
      }
      const updated = await updateUserProfile(newName);
      document.getElementById('profileAvatar').textContent = updated.nickname.slice(0, 1);
      this.updateUserAuthUI();
      this.showToast(`✓ 昵称已更新为「${updated.nickname}」`);
    });

    // Bind New Hardware Device by UID
    document.getElementById('btnBindNewDevice').addEventListener('click', async () => {
      const uidInput = document.getElementById('inputBindDeviceUid');
      const uid = uidInput.value.trim();
      if (!uid || uid.length < 8) {
        this.showToast('⚠️ 请输入合法的 NFC 硬件 UID');
        return;
      }
      try {
        const res = await activateDevice(uid, `相框_${uid.slice(-4)}`);
        await this.renderBoundDevicesList();
        this.updateActiveDevicePill();
        this.showToast(`⚡ 已成功绑定并签发 Ed25519 票据 (${res.device.nickname})`);
      } catch (err) {
        this.showToast('⚠️ 绑定失败: ' + err.message);
      }
    });

    // Send SMS Code
    const btnSendSMS = document.getElementById('btnSendSMS');
    btnSendSMS.addEventListener('click', async () => {
      const phone = document.getElementById('inputPhone').value.trim();
      if (!phone || phone.length < 11) {
        this.showToast('⚠️ 请输入有效的 11 位手机号');
        return;
      }
      btnSendSMS.disabled = true;
      try {
        await sendSMS(phone);
        this.showToast('📩 验证码已发送（调试验证码：888888）');
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
        this.showToast('⚠️ ' + err.message);
        btnSendSMS.disabled = false;
        btnSendSMS.textContent = '获取验证码';
      }
    });

    // Submit Login
    document.getElementById('btnSubmitLogin').addEventListener('click', async () => {
      const phone = document.getElementById('inputPhone').value.trim();
      const code = document.getElementById('inputSMSCode').value.trim();
      if (!phone || !code) {
        this.showToast('⚠️ 手机号和验证码不能为空');
        return;
      }

      const submitBtn = document.getElementById('btnSubmitLogin');
      submitBtn.disabled = true;
      submitBtn.textContent = '正在登录...';

      try {
        const { user } = await loginBySMS(phone, code);
        this.updateUserAuthUI();
        loginModal.close();
        this.showToast(`🎉 欢迎回来，${user.nickname}！云相册已同步`);
      } catch (err) {
        this.showToast('⚠️ 登录失败: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '登 录';
      }
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
      logout();
      this.updateUserAuthUI();
      profileModal.close();
      this.showToast('👋 已退出当前账号');
    });

    // Open History Gallery
    document.getElementById('btnOpenHistory').addEventListener('click', () => {
      this.renderHistoryList();
      historyModal.showModal();
    });
  }

  async renderBoundDevicesList() {
    const container = document.getElementById('boundDevicesList');
    if (!container) return;
    const devices = await fetchMyDevices();
    const activeDev = getActiveDevice();
    container.innerHTML = '';

    devices.forEach(dev => {
      const isCur = activeDev && (activeDev.id === dev.id || activeDev.uid_last4 === dev.uid_last4);
      const item = document.createElement('div');
      item.className = `bound-device-card ${isCur ? 'active' : ''}`;
      item.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 12px; font-weight: 700; color: #fff;">
            ${isCur ? '● ' : ''}${dev.nickname || '墨水屏相框'}
          </span>
          <span style="font-size: 10px; color: var(--color-text-secondary); font-family: var(--font-mono);">
            ID: ${dev.id} · UID尾号: ${dev.uid_last4 || '8180'} · ${dev.location || '桌面'}
          </span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="history-action-btn ${isCur ? 'primary' : ''} btn-select-dev">
            ${isCur ? '当前使用' : '切换'}
          </button>
          <button type="button" class="history-action-btn delete btn-unbind-dev">解绑</button>
        </div>
      `;

      item.querySelector('.btn-select-dev').addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveDevice(dev);
        this.updateActiveDevicePill();
        this.renderBoundDevicesList();
        this.showToast(`🖼️ 已切换目标相框为「${dev.nickname}」`);
      });

      item.querySelector('.btn-unbind-dev').addEventListener('click', async (e) => {
        e.stopPropagation();
        await unbindDevice(dev.id);
        await this.renderBoundDevicesList();
        this.showToast(`已解绑设备 ${dev.nickname}`);
      });

      container.appendChild(item);
    });
  }

  // --- Save Current Artwork to History ---
  async saveCurrentArtworkToHistory(customTitle = '', initialFlashCount = 0) {
    if (!this.simulator.canvas) return null;

    const previewDataUrl = this.simulator.canvas.toDataURL('image/png');

    let bitmapB64 = '';
    if (this.state.packed30kPayload) {
      let binary = '';
      const len = this.state.packed30kPayload.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(this.state.packed30kPayload[i]);
      }
      bitmapB64 = btoa(binary);
    }

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
      customSubtitle: this.state.customSubtitle,
      imageSrc: this.state.imageSrc
    };

    const presetName = this.state.selectedPreset?.name || '经典微调';
    const title = customTitle ? `${presetName} · ${customTitle}` : `${presetName} 创作照片`;
    const activeDev = getActiveDevice();

    return await createArtwork({
      title,
      subtitle: this.state.customSubtitle || `${presetName.toUpperCase()} · 400x300`,
      original_image_url: this.state.imageSrc,
      rendered_preview_url: previewDataUrl,
      bitmap_base64: bitmapB64,
      filter_id: this.state.selectedPreset?.id || 'polaroid_600',
      frame_id: this.state.frameTemplate,
      dither_method: this.state.ditherAlgorithm,
      params_json: JSON.stringify(params),
      target_device_id: activeDev?.id || 'dev_demo_401a',
      flashed_count: initialFlashCount
    });
  }

  // --- Render History Gallery Modal Content ---
  async renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    const countBadge = document.getElementById('historyCountBadge');
    container.innerHTML = '<div style="color: var(--color-text-secondary); text-align: center; padding: 30px; font-size: 13px;">正在同步历史照片记录...</div>';

    const { artworks } = await fetchMyArtworks();
    countBadge.textContent = `${artworks.length} 张`;
    container.innerHTML = '';

    if (!artworks || artworks.length === 0) {
      container.innerHTML = `
        <div class="history-empty-state">
          <div class="history-empty-icon">🖼️</div>
          <div style="font-size: 15px; font-weight: 700; color: #FFFFFF;">暂无历史照片记录</div>
          <p style="font-size: 12px; max-width: 260px; line-height: 1.5;">
            在暗室完成调色后点击「💾 存入相册」或烧录至相框，即可随时在这里查阅和一键载入恢复全部调色参数！
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
          <img src="${thumbUrl}" alt="${art.title}" width="88" height="66" loading="lazy">
        </div>
        <div class="history-item-info">
          <span class="history-item-title" title="点击可修改作品标题">${art.title || '无标题作品'} ✎</span>
          <div class="history-item-meta">
            <span class="badge badge-film">${filterTag}</span>
            <span>📅 ${dateStr}</span>
            ${art.flashed_count > 0 ? `<span style="color: var(--color-accent-primary);">⚡ 已刷 ${art.flashed_count} 次</span>` : ''}
          </div>
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn primary btn-restore" title="100% 恢复当时的图片、构图与调色滑块">
            载入暗室
          </button>
          <button class="history-action-btn delete btn-delete" title="删除该记录">
            删除
          </button>
        </div>
      `;

      // Click title to rename artwork
      card.querySelector('.history-item-title').addEventListener('click', async () => {
        const nextTitle = prompt('修改作品名称：', art.title || '');
        if (nextTitle && nextTitle.trim()) {
          await updateArtworkTitle(art.id, nextTitle.trim(), art.subtitle);
          this.renderHistoryList();
          this.showToast('✓ 作品名称已更新');
        }
      });

      // Restore to Darkroom Studio
      card.querySelector('.btn-restore').addEventListener('click', async () => {
        document.getElementById('historyModal').close();
        await this.restoreArtwork(art);
        this.showToast(`✨ 已复原「${art.title}」的全部暗室参数`);
      });

      // Delete Artwork
      card.querySelector('.btn-delete').addEventListener('click', async () => {
        await deleteArtwork(art.id);
        this.renderHistoryList();
        this.showToast('🗑️ 已从相册历史中移除');
      });

      container.appendChild(card);
    });
  }

  // --- Restore Artwork into Studio ---
  async restoreArtwork(art) {
    if (art.frame_id) {
      this.state.frameTemplate = art.frame_id;
      document.querySelectorAll('[data-frame]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.frame === art.frame_id);
      });
    }

    if (art.dither_method) {
      this.state.ditherAlgorithm = art.dither_method;
      document.querySelectorAll('[data-dither]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dither === art.dither_method);
      });
    }

    if (art.filter_id && this.state.presets) {
      const match = this.state.presets.find(p => p.id === art.filter_id);
      if (match) {
        this.state.selectedPreset = match;
        document.querySelectorAll('.film-card').forEach(c => {
          c.classList.toggle('active', c.dataset.id === match.id);
        });
      }
    }

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
        if (p.customSubtitle !== undefined) {
          this.state.customSubtitle = p.customSubtitle;
          const subIn = document.getElementById('inputFrameSubtitle');
          if (subIn) subIn.value = p.customSubtitle;
        }
        if (p.imageSrc) loadedImageSrc = p.imageSrc;

        if (p.brightness !== undefined) {
          this.state.brightness = p.brightness;
          this.setSliderValue('sliderBrightness', 'valBrightness', p.brightness, (v) => v);
        }
        if (p.contrast !== undefined) {
          this.state.contrast = p.contrast;
          this.setSliderValue('sliderContrast', 'valContrast', p.contrast, (v) => v.toFixed(2));
        }
        if (p.saturation !== undefined) {
          this.state.saturation = p.saturation;
          this.setSliderValue('sliderSaturation', 'valSaturation', p.saturation, (v) => v.toFixed(2));
        }
        if (p.warmth !== undefined) {
          this.state.warmth = p.warmth;
          this.setSliderValue('sliderWarmth', 'valWarmth', p.warmth, (v) => v);
        }
        if (p.sharpness !== undefined) {
          this.state.sharpness = p.sharpness;
          const sPct = Math.round(p.sharpness * 100);
          this.setSliderValue('sliderSharpness', 'valSharpness', sPct, (v) => `${v}%`);
        }
        if (p.redDamper !== undefined) {
          this.state.redDamper = p.redDamper;
          this.setSliderValue('sliderRedDamper', 'valRedDamper', p.redDamper, (v) => v.toFixed(2));
        }
      } catch (e) {
        console.warn('Failed to parse artwork params_json:', e);
      }
    }

    this.syncTransformUI();
    this.state.imageSrc = loadedImageSrc;
    await this.loadImage(loadedImageSrc);
  }

  updateSliderFill(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    slider.style.setProperty('--slider-pct', `${pct.toFixed(1)}%`);
  }

  initAllSliderProgressTracks() {
    document.querySelectorAll('input[type="range"]').forEach(s => this.updateSliderFill(s));
  }

  setSliderValue(sliderId, valId, val, formatter) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valId);
    if (!slider || !label) return;
    slider.value = val;
    label.textContent = formatter(parseFloat(val));
    this.updateSliderFill(slider);
  }

  bindSlider(sliderId, valId, defaultVal, setter, formatter) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valId);
    if (!slider || !label) return;

    const onInput = (v) => {
      setter(v);
      label.textContent = formatter(v);
      this.updateSliderFill(slider);
      this.scheduleRender();
    };

    slider.addEventListener('input', (e) => {
      onInput(parseFloat(e.target.value));
    });

    // Double-tap / double-click on header row or slider to reset individual parameter
    const unit = slider.closest('.slider-unit');
    if (unit) {
      let lastHeaderTap = 0;
      const header = unit.querySelector('.slider-header-row');
      if (header) {
        header.addEventListener('click', () => {
          const now = Date.now();
          if (now - lastHeaderTap < 320) {
            slider.value = defaultVal;
            onInput(defaultVal);
            this.showToast('↺ 该项参数已归零');
            lastHeaderTap = 0;
          } else {
            lastHeaderTap = now;
          }
        });
      }
    }
  }

  resetTransform() {
    this.state.rotation = 0;
    this.state.flipH = false;
    this.state.zoom = 1.0;
    this.state.panX = 0;
    this.state.panY = 0;
    const btnFlip = document.getElementById('btnFlipH');
    if (btnFlip) btnFlip.classList.remove('active');
    this.syncTransformUI();
  }

  resetTones() {
    this.state.brightness = 0;
    this.state.contrast = 1.20;
    this.state.saturation = 1.15;
    this.state.warmth = 0;
    this.state.sharpness = 0.40;
    this.state.redDamper = 1.15;

    this.setSliderValue('sliderBrightness', 'valBrightness', 0, (v) => v);
    this.setSliderValue('sliderContrast', 'valContrast', 1.20, (v) => v.toFixed(2));
    this.setSliderValue('sliderSaturation', 'valSaturation', 1.15, (v) => v.toFixed(2));
    this.setSliderValue('sliderWarmth', 'valWarmth', 0, (v) => v);
    this.setSliderValue('sliderSharpness', 'valSharpness', 40, (v) => `${v}%`);
    this.setSliderValue('sliderRedDamper', 'valRedDamper', 1.15, (v) => v.toFixed(2));
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
    const presetName = this.state.selectedPreset ? this.state.selectedPreset.name : 'RNI ALL FILMS';

    // 1. Frame Template Layout (Polaroid / Postcard / Gallery Matte / Full Bleed)
    if (this.state.frameTemplate === 'polaroid') {
      ctx.fillStyle = '#F5F2EB';
      ctx.fillRect(0, 0, 400, 300);
      photoBox = { x: 16, y: 14, w: 368, h: 242 };

      ctx.fillStyle = '#181818';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      const caption = this.state.customSubtitle.trim() || `${presetName.toUpperCase()} · 2026`;
      ctx.fillText(caption, 200, 278);
    } else if (this.state.frameTemplate === 'postcard') {
      ctx.fillStyle = '#F5F2EB';
      ctx.fillRect(0, 0, 400, 300);
      photoBox = { x: 12, y: 12, w: 376, h: 250 };

      ctx.fillStyle = '#181818';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      const leftTxt = this.state.customSubtitle.trim() || presetName.toUpperCase();
      ctx.fillText(leftTxt, 14, 282);

      ctx.fillStyle = '#D8262C';
      ctx.textAlign = 'right';
      ctx.fillText('35MM · F/2.8 · ISO 400', 386, 282);
    } else if (this.state.frameTemplate === 'gallery') {
      ctx.fillStyle = '#F5F2EB';
      ctx.fillRect(0, 0, 400, 300);
      photoBox = { x: 28, y: 24, w: 344, h: 252 };

      // Subtle inner museum passepartout line
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 1;
      ctx.strokeRect(25, 21, 350, 258);
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
    } else if (this.state.ditherAlgorithm === 'floyd') {
      ditherResult = ditherFloydSteinberg(pixels, this.state.redDamper);
    } else {
      ditherResult = ditherOrderedBayer(pixels, this.state.redDamper);
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
    } else if (this.state.ditherAlgorithm === 'floyd') {
      return ditherFloydSteinberg(pixels, this.state.redDamper);
    }
    return ditherOrderedBayer(pixels, this.state.redDamper);
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
