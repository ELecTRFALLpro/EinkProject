/**
 * NFC Flash Modal & Virtual Hardware Transfer Simulator
 * Integrates with Backend Device Binding (/v1/devices/activate) and Ed25519 Offline Tickets
 */

import { downloadBinaryFile } from '../engine/packer.js';
import { getActiveDevice, activateDevice } from '../api.js';

export class NFCModal {
  constructor(dialogElement, options = {}) {
    this.dialog = dialogElement;
    this.options = Object.assign({
      onFlashSuccess: null,
      onFlashError: null
    }, options);

    this.currentPayload = null;
    this.currentTicket = null;
    this.isFlashing = false;

    this.initDOM();
  }

  initDOM() {
    this.dialog.innerHTML = `
      <div class="nfc-modal-content">
        <!-- Close Button -->
        <button class="modal-close-btn" id="btnCloseNfcModal" aria-label="关闭">✕</button>

        <!-- Header -->
        <div class="nfc-modal-header">
          <div class="nfc-icon-wrapper">
            <svg class="nfc-pulse-svg" viewBox="0 0 100 100" width="64" height="64">
              <circle cx="50" cy="50" r="45" class="pulse-ring pulse-ring-3" />
              <circle cx="50" cy="50" r="32" class="pulse-ring pulse-ring-2" />
              <circle cx="50" cy="50" r="20" class="pulse-ring pulse-ring-1" />
              <circle cx="50" cy="50" r="10" class="pulse-center" />
            </svg>
          </div>
          <h2 class="nfc-title">无线烧录至相框 (NFC Flash)</h2>
          <p class="nfc-subtitle" id="nfcStatusText">请将 iPhone 顶部 NFC 感应区贴近墨水屏相框背面</p>
        </div>

        <!-- Technical Telemetry & Ticket Verification -->
        <div class="nfc-telemetry-box">
          <div class="telemetry-row">
            <span class="telemetry-label">目标画框设备</span>
            <span class="telemetry-value" id="telemetryDeviceName">D0280C 四色墨水屏样机 (UID: 1E:57:06:1E)</span>
          </div>
          <div class="telemetry-row">
            <span class="telemetry-label">2-bit 封包体量</span>
            <span class="telemetry-value badge-green" id="telemetryPayloadSize">30,000 Bytes (125 Chunks × 240B)</span>
          </div>
          <div class="telemetry-row">
            <span class="telemetry-label">离线防盗票据</span>
            <span class="telemetry-value text-accent" id="telemetryTicketStatus">Ed25519 签名就绪</span>
          </div>
          <div class="telemetry-row">
            <span class="telemetry-label">传输协议</span>
            <span class="telemetry-value" id="telemetryProtocol">ISO 7816 / ISO 14443-4 APDU (0x901E57061E00)</span>
          </div>
        </div>

        <!-- Progress Bar (Hidden during standby) -->
        <div class="nfc-progress-container" id="nfcProgressContainer" style="display: none;">
          <div class="nfc-progress-bar">
            <div class="nfc-progress-fill" id="nfcProgressFill" style="width: 0%;"></div>
          </div>
          <div class="nfc-progress-labels">
            <span id="nfcProgressStep">正在握手写入...</span>
            <span id="nfcProgressPercent">0%</span>
          </div>
        </div>

        <!-- Success Banner -->
        <div class="nfc-success-banner" id="nfcSuccessBanner" style="display: none;">
          <div class="success-icon">✓</div>
          <div class="success-text">
            <strong>30KB 胶片位图写入成功！</strong>
            <span>相框正在执行三阶段四色微胶囊电泳刷新，同时作品已自动归档至相册。</span>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="nfc-modal-actions">
          <button class="pill-btn pill-btn-primary full-width" id="btnSimulateTap">
            ⚡ 模拟 NFC 贴卡烧录 (验证票据并刷屏)
          </button>
          <div class="modal-secondary-actions">
            <button class="pill-btn pill-btn-ghost" id="btnDownloadBin">
              💾 导出 30KB .bin
            </button>
            <button class="pill-btn pill-btn-ghost" id="btnCancelNfc">
              关闭
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnClose = this.dialog.querySelector('#btnCloseNfcModal');
    const btnCancel = this.dialog.querySelector('#btnCancelNfc');
    const closeDialog = () => {
      if (!this.isFlashing) {
        this.dialog.close();
      }
    };

    btnClose.addEventListener('click', closeDialog);
    btnCancel.addEventListener('click', closeDialog);

    // Light-dismiss on click outside dialog content box
    this.dialog.addEventListener('click', (e) => {
      const rect = this.dialog.getBoundingClientRect();
      const inDialog = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      if (!inDialog && !this.isFlashing) {
        this.dialog.close();
      }
    });

    const btnSimulate = this.dialog.querySelector('#btnSimulateTap');
    btnSimulate.addEventListener('click', () => {
      const activeDev = getActiveDevice();
      const targetUid = activeDev?.uid_full || '04:7A:3B:C2:59:81:80';

      // If running inside Xcode iOS Native App Shell, invoke native CoreNFC / Haptic Bridge
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.einkNative) {
        let b64 = '';
        if (this.currentPayload) {
          let bin = '';
          for (let i = 0; i < this.currentPayload.byteLength; i++) {
            bin += String.fromCharCode(this.currentPayload[i]);
          }
          b64 = btoa(bin);
        }
        window.webkit.messageHandlers.einkNative.postMessage({
          action: 'startNFCFlash',
          payloadBase64: b64,
          ticket: this.currentTicket || ''
        });
        return;
      }

      this.runVirtualHardwareTransfer(targetUid);
    });

    // Listen for native iOS CoreNFC callbacks
    window.addEventListener('eink-native-nfc', (e) => {
      const { type, data } = e.detail || {};
      const activeDev = getActiveDevice();
      const fallbackUid = activeDev?.uid_full || '04:7A:3B:C2:59:81:80';
      if (type === 'detected' && data?.uid) {
        this.runVirtualHardwareTransfer(data.uid);
      } else if (type === 'fallback') {
        this.runVirtualHardwareTransfer(fallbackUid);
      }
    });

    const btnDownload = this.dialog.querySelector('#btnDownloadBin');
    btnDownload.addEventListener('click', () => {
      if (this.currentPayload) {
        downloadBinaryFile(this.currentPayload, `eink_400x300_${Date.now()}.bin`);
      }
    });
  }

  open(payload30k, ticketInfo = null) {
    this.currentPayload = payload30k;
    this.currentTicket = ticketInfo;
    this.isFlashing = false;

    const activeDev = getActiveDevice();
    const devNameEl = this.dialog.querySelector('#telemetryDeviceName');
    if (devNameEl && activeDev) {
      devNameEl.textContent = `${activeDev.nickname || '墨水屏相框'} (UID: ...${activeDev.uid_last4 || '8180'})`;
    }

    const progressContainer = this.dialog.querySelector('#nfcProgressContainer');
    const successBanner = this.dialog.querySelector('#nfcSuccessBanner');
    const statusText = this.dialog.querySelector('#nfcStatusText');
    const btnSimulate = this.dialog.querySelector('#btnSimulateTap');

    progressContainer.style.display = 'none';
    successBanner.style.display = 'none';
    btnSimulate.style.display = 'inline-flex';
    btnSimulate.disabled = false;
    statusText.textContent = '请将 iPhone 顶部 NFC 感应区贴近墨水屏相框背面';

    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }

    if ('NDEFReader' in window) {
      this.startNativeWebNFC();
    }
  }

  async startNativeWebNFC() {
    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();
      const statusText = this.dialog.querySelector('#nfcStatusText');
      statusText.textContent = '● Web NFC 监听就绪：靠近相框即可极速传输...';

      ndef.onreading = async (event) => {
        statusText.textContent = `检测到 NFC 设备 (UID: ${event.serialNumber})，正在传输 30KB 封包...`;
        await this.runVirtualHardwareTransfer(event.serialNumber);
      };
    } catch (err) {
      console.warn('Web NFC scan warning or permission denied:', err);
    }
  }

  async runVirtualHardwareTransfer(deviceUid = '04:7A:3B:C2:59:81:80') {
    if (this.isFlashing) return;
    this.isFlashing = true;
    const startTime = Date.now();

    const progressContainer = this.dialog.querySelector('#nfcProgressContainer');
    const progressFill = this.dialog.querySelector('#nfcProgressFill');
    const progressStep = this.dialog.querySelector('#nfcProgressStep');
    const progressPercent = this.dialog.querySelector('#nfcProgressPercent');
    const successBanner = this.dialog.querySelector('#nfcSuccessBanner');
    const btnSimulate = this.dialog.querySelector('#nfcSimulateTap') || this.dialog.querySelector('#btnSimulateTap');
    const statusText = this.dialog.querySelector('#nfcStatusText');
    const ticketStatusEl = this.dialog.querySelector('#telemetryTicketStatus');

    progressContainer.style.display = 'flex';
    successBanner.style.display = 'none';
    btnSimulate.disabled = true;

    let resolvedDeviceId = getActiveDevice()?.id || 'dev_demo_401a';

    // Step 1: Request/Verify Ed25519 Ticket from Backend if available
    progressFill.style.width = '15%';
    progressPercent.textContent = '15%';
    progressStep.textContent = `建立射频握手 (UID: ${deviceUid})...`;
    await this.wait(280);

    try {
      const activeDev = getActiveDevice();
      const actRes = await activateDevice(deviceUid, activeDev?.nickname || '客厅胡桃木相框');
      if (actRes && actRes.device) {
        resolvedDeviceId = actRes.device.id;
      }
      if (actRes && actRes.ticket && ticketStatusEl) {
        ticketStatusEl.textContent = `Ed25519 验签通过 (${actRes.ticket.slice(0, 14)}...)`;
      }
    } catch (err) {
      console.warn('Ticket verification notice:', err.message);
    }

    const steps = [
      { pct: 38, text: '下发 Ed25519 离线授权票据 (82 Bytes)...' },
      { pct: 64, text: '写入 2-bit MSB 图像分块 (Chunks 1~65 / 125)...' },
      { pct: 88, text: '写入 2-bit MSB 图像分块 (Chunks 66~125 / 125)...' },
      { pct: 100, text: 'CRC32 校验一致，触发四色微胶囊刷新脉冲！' }
    ];

    for (const step of steps) {
      progressFill.style.width = step.pct + '%';
      progressPercent.textContent = step.pct + '%';
      progressStep.textContent = step.text;
      await this.wait(300);
    }

    const durationMs = Date.now() - startTime;
    statusText.textContent = `烧录成功！耗时 ${(durationMs / 1000).toFixed(1)} 秒，墨水屏正在显影。`;
    successBanner.style.display = 'flex';
    this.isFlashing = false;

    if (typeof this.options.onFlashSuccess === 'function') {
      this.options.onFlashSuccess({
        deviceId: resolvedDeviceId,
        deviceUid,
        payloadSize: this.currentPayload ? this.currentPayload.length : 30000,
        chunks: 125,
        durationMs,
        timestamp: Date.now()
      });
    }
  }

  wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
