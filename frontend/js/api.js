/**
 * Backend API Client for EinkProject
 * Supports Authentication, User Profile, Device Binding & Ed25519 Tickets,
 * Photo Upload, Artworks History, and robust Offline Fallback Mode.
 */

const CUSTOM_API_KEY = 'eink_custom_api_base';

export function getApiBase() {
  const custom = localStorage.getItem(CUSTOM_API_KEY);
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  const { protocol, hostname, port } = window.location;
  // Inside Xcode iOS Native WKWebView (eink://app) or local file://
  if (protocol === 'eink:' || protocol === 'file:' || protocol === 'capacitor:') {
    return 'http://localhost:8080/v1';
  }
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalHost && port && port !== '8080') {
    return 'http://localhost:8080/v1';
  }
  return '/v1';
}

export function setCustomApiBase(url) {
  if (url && url.trim()) {
    localStorage.setItem(CUSTOM_API_KEY, url.trim());
  } else {
    localStorage.removeItem(CUSTOM_API_KEY);
  }
}

const API_BASE = getApiBase();
const TOKEN_KEY = 'eink_jwt_token';
const USER_KEY = 'eink_user_profile';
const OFFLINE_ARTWORKS_KEY = 'eink_offline_artworks';
const OFFLINE_DEVICES_KEY = 'eink_offline_devices';
const ACTIVE_DEVICE_KEY = 'eink_active_device';

// Auth State Helpers
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getCurrentUser() {
  const u = localStorage.getItem(USER_KEY);
  if (!u) return null;
  try {
    return JSON.parse(u);
  } catch (_) {
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function isLoggedIn() {
  return !!getAuthToken();
}

export function logout() {
  setAuthToken('');
  setCurrentUser(null);
}

// 1. Auth & Profile Endpoints
export async function sendSMS(phone) {
  try {
    const res = await fetch(`${API_BASE}/auth/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(data.message || '发送验证码失败');
    }
    return data.data;
  } catch (err) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    // Offline fallback for dev demo
    return { sent: true, tip: '离线调试模式：默认验证码 888888' };
  }
}

export async function loginBySMS(phone, code) {
  try {
    const res = await fetch(`${API_BASE}/auth/sms/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(data.message || '登录失败');
    }
    const { token, user } = data.data;
    setAuthToken(token);
    setCurrentUser(user);
    return { token, user };
  } catch (err) {
    if (err.message && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    // Offline fallback login when backend isn't running
    if (code !== '888888') {
      throw new Error('验证码错误（测试环境请输入 888888）');
    }
    const mockUser = {
      id: 1,
      phone,
      nickname: `胶片玩家_${phone.slice(-4)}`,
      status: 'active'
    };
    const mockToken = 'offline_jwt_' + Date.now();
    setAuthToken(mockToken);
    setCurrentUser(mockUser);
    return { token: mockToken, user: mockUser };
  }
}

export async function fetchProfile() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.user) {
        setCurrentUser(data.data.user);
        return data.data.user;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch profile online:', err.message);
  }
  return getCurrentUser();
}

export async function updateUserProfile(nickname, avatarUrl = '') {
  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nickname, avatar_url: avatarUrl })
      });
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.user) {
        setCurrentUser(data.data.user);
        return data.data.user;
      }
    } catch (e) {
      console.warn('Update profile offline fallback:', e.message);
    }
  }

  const cur = getCurrentUser() || {};
  const updated = { ...cur, nickname: nickname || cur.nickname };
  setCurrentUser(updated);
  return updated;
}

// 2. Device Binding & Ed25519 Ticket Endpoints
function getDefaultOfflineDevices() {
  try {
    const raw = localStorage.getItem(OFFLINE_DEVICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { }
  const initial = [
    {
      id: 'dev_demo_401a',
      uid_last4: '8180',
      uid_full: '04:7A:3B:C2:59:81:80',
      profile_id: 'vA-400x300-bwry',
      status: 'bound',
      nickname: '客厅胡桃木相框',
      location: '客厅茶几'
    }
  ];
  localStorage.setItem(OFFLINE_DEVICES_KEY, JSON.stringify(initial));
  return initial;
}

function saveOfflineDevices(list) {
  try {
    localStorage.setItem(OFFLINE_DEVICES_KEY, JSON.stringify(list));
  } catch (_) { }
}

export function getActiveDevice() {
  try {
    const raw = localStorage.getItem(ACTIVE_DEVICE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { }
  const list = getDefaultOfflineDevices();
  return list[0] || {
    id: 'dev_demo_401a',
    uid_last4: '8180',
    uid_full: '04:7A:3B:C2:59:81:80',
    nickname: '客厅胡桃木相框',
    location: '客厅茶几'
  };
}

export function setActiveDevice(dev) {
  if (!dev) return;
  try {
    localStorage.setItem(ACTIVE_DEVICE_KEY, JSON.stringify(dev));
  } catch (_) { }
}

export async function fetchMyDevices() {
  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === 0 && data.data && Array.isArray(data.data.devices)) {
          if (data.data.devices.length > 0) {
            return data.data.devices;
          }
        }
      }
    } catch (e) {
      console.warn('fetchMyDevices offline fallback:', e.message);
    }
  }
  return getDefaultOfflineDevices();
}

export async function activateDevice(uid, nickname = '我的墨水屏相框', activationCode = '') {
  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/devices/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid, nickname, activation_code: activationCode })
      });
      const data = await res.json();
      if (data.code === 0 && data.data) {
        if (data.data.device) {
          setActiveDevice({ ...data.data.device, uid_full: uid });
        }
        return data.data; // { device, ticket, payload }
      } else {
        throw new Error(data.message || '设备绑定激活失败');
      }
    } catch (e) {
      if (e.message && !e.message.includes('Failed to fetch')) {
        throw e;
      }
    }
  }

  // Offline simulation fallback
  const norm = uid.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  const last4 = norm.slice(-4) || '8180';
  const dev = {
    id: `dev_${last4.toLowerCase()}`,
    uid_last4: last4,
    uid_full: uid,
    profile_id: 'vA-400x300-bwry',
    status: 'bound',
    nickname: nickname || `墨水屏_${last4}`,
    location: '桌面画架'
  };
  const list = getDefaultOfflineDevices().filter(d => d.uid_last4 !== last4);
  list.unshift(dev);
  saveOfflineDevices(list);
  setActiveDevice(dev);

  return {
    device: dev,
    ticket: 'ed25519_sig_' + btoa(`${dev.id}:${norm}:${Date.now()}`).slice(0, 32),
    payload: {
      device_id: dev.id,
      uid_norm: norm,
      profile_id: 'vA-400x300-bwry',
      adapter_id: 'vendorA@1',
      expires_at: Math.floor(Date.now() / 1000) + 86400 * 30
    }
  };
}

export async function updateDeviceInfo(deviceId, nickname, location) {
  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nickname, location })
      });
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.device) {
        setActiveDevice(data.data.device);
        return data.data.device;
      }
    } catch (_) { }
  }

  const list = getDefaultOfflineDevices().map(d => {
    if (d.id === deviceId) {
      const updated = { ...d, nickname: nickname || d.nickname, location: location || d.location };
      setActiveDevice(updated);
      return updated;
    }
    return d;
  });
  saveOfflineDevices(list);
  return list.find(d => d.id === deviceId);
}

export async function unbindDevice(deviceId) {
  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      await fetch(`${API_BASE}/devices/${deviceId}/binding`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (_) { }
  }
  const list = getDefaultOfflineDevices().filter(d => d.id !== deviceId);
  saveOfflineDevices(list);
  return true;
}

// 3. Photo Upload Endpoint
export async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.message || '图片上传失败');
  }
  return data.data; // { url: "/uploads/img_xxx.jpg", filename: "..." }
}

// 4. User Artworks / Photo History Endpoints (with Offline Fallback)
export async function fetchMyArtworks(page = 1, pageSize = 30) {
  const token = getAuthToken();

  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/works?page=${page}&page_size=${pageSize}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === 0 && data.data) {
          const offlineList = getOfflineArtworks();
          const serverList = data.data.artworks || [];
          return {
            artworks: [...offlineList, ...serverList],
            total: (data.data.total || 0) + offlineList.length
          };
        }
      }
    } catch (e) {
      console.warn('Backend /v1/works unreachable, falling back to offline storage');
    }
  }

  const offline = getOfflineArtworks();
  return { artworks: offline, total: offline.length };
}

export async function createArtwork(payload) {
  const token = getAuthToken();

  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/works`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.artwork) {
        return data.data.artwork;
      }
    } catch (e) {
      console.warn('Server save failed, saving offline:', e.message);
    }
  }

  const offlineArt = {
    id: 'local_' + Date.now(),
    title: payload.title || '我的胶片记录',
    subtitle: payload.subtitle || '',
    original_image_url: payload.original_image_url || '',
    rendered_preview_url: payload.rendered_preview_url || '',
    bitmap_base64: payload.bitmap_base64 || '',
    filter_id: payload.filter_id || '',
    frame_id: payload.frame_id || '',
    dither_method: payload.dither_method || 'atkinson',
    params_json: payload.params_json || '',
    flashed_count: payload.flashed_count || 0,
    created_at: new Date().toISOString()
  };

  saveOfflineArtwork(offlineArt);
  return offlineArt;
}

export async function updateArtworkTitle(id, title, subtitle = '') {
  if (id.startsWith('local_')) {
    const list = getOfflineArtworks().map(item => {
      if (item.id === id) {
        return { ...item, title: title || item.title, subtitle: subtitle || item.subtitle };
      }
      return item;
    });
    localStorage.setItem(OFFLINE_ARTWORKS_KEY, JSON.stringify(list));
    return list.find(i => i.id === id);
  }

  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/works/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, subtitle })
      });
      const data = await res.json();
      if (data.code === 0 && data.data) return data.data.artwork;
    } catch (_) { }
  }
  return null;
}

export async function recordArtworkFlashed(id, deviceId = '') {
  if (!id) return;
  if (id.startsWith('local_')) {
    const list = getOfflineArtworks().map(item => {
      if (item.id === id) {
        return { ...item, flashed_count: (item.flashed_count || 0) + 1 };
      }
      return item;
    });
    localStorage.setItem(OFFLINE_ARTWORKS_KEY, JSON.stringify(list));
    return;
  }

  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      await fetch(`${API_BASE}/works/${id}/flash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ device_id: deviceId })
      });
    } catch (_) { }
  }
}

export async function deleteArtwork(id) {
  if (id.startsWith('local_')) {
    deleteOfflineArtwork(id);
    return true;
  }

  const token = getAuthToken();
  if (token && !token.startsWith('offline_')) {
    try {
      const res = await fetch(`${API_BASE}/works/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data.code === 0;
    } catch (e) {
      console.warn('Failed to delete on server:', e.message);
    }
  }

  deleteOfflineArtwork(id);
  return true;
}

function getOfflineArtworks() {
  try {
    const raw = localStorage.getItem(OFFLINE_ARTWORKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveOfflineArtwork(art) {
  try {
    const list = getOfflineArtworks();
    list.unshift(art);
    if (list.length > 50) list.pop();
    localStorage.setItem(OFFLINE_ARTWORKS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to save artwork offline:', err);
  }
}

function deleteOfflineArtwork(id) {
  try {
    let list = getOfflineArtworks();
    list = list.filter(item => item.id !== id);
    localStorage.setItem(OFFLINE_ARTWORKS_KEY, JSON.stringify(list));
  } catch (_) { }
}

// 5. Config & Presets
export async function fetchFilters() {
  try {
    const res = await fetch(`${API_BASE}/filters`);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.filters) {
        return data.data.filters;
      }
    }
  } catch (e) {
    console.warn('Backend /v1/filters unreachable, falling back to local manifest:', e.message);
  }

  const fallbackRes = await fetch('presets/manifest.json');
  return await fallbackRes.json();
}

export async function fetchFrames() {
  try {
    const res = await fetch(`${API_BASE}/frames`);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 0 && data.data && data.data.frames) {
        return data.data.frames;
      }
    }
  } catch (e) {
    console.warn('Backend /v1/frames unreachable, falling back to default frames');
  }

  return [
    { id: 'polaroid_classic', name: '经典拍立得 (Polaroid Classic)', aspect: '4:3' },
    { id: 'postcard_exif', name: '胶片明信片 (Film Postcard)', aspect: '4:3' },
    { id: 'gallery_matte', name: '艺术画廊留白 (Gallery Matte)', aspect: '4:3' },
    { id: 'minimal_edge', name: '全屏无边框 (Full Bleed)', aspect: '4:3' }
  ];
}

export async function recordFlashTelemetry(record) {
  try {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token && !token.startsWith('offline_')) {
      headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE}/telemetry/flash`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record)
      });
    }
  } catch (e) {
    console.warn('Telemetry flash record skipped (offline):', e.message);
  }
}
