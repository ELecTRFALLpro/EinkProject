/**
 * Backend API Client for EinkProject
 * Supports Authentication, User Profile, Photo Upload, Artworks History,
 * and robust Offline Fallback Mode.
 */

const API_BASE = window.location.origin.includes('8080')
  ? '/v1'
  : 'http://localhost:8080/v1';

const TOKEN_KEY = 'eink_jwt_token';
const USER_KEY = 'eink_user_profile';
const OFFLINE_ARTWORKS_KEY = 'eink_offline_artworks';

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

// 1. Auth Endpoints
export async function sendSMS(phone) {
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
}

export async function loginBySMS(phone, code) {
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

// 2. Photo Upload Endpoint
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

// 3. User Artworks / Photo History Endpoints (with Offline Fallback)
export async function fetchMyArtworks(page = 1, pageSize = 30) {
  const token = getAuthToken();

  // If online & logged in, fetch from backend
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/works?page=${page}&page_size=${pageSize}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === 0 && data.data) {
          // Merge with any offline-saved drafts
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

  // Fallback to offline stored artworks
  const offline = getOfflineArtworks();
  return { artworks: offline, total: offline.length };
}

export async function createArtwork(payload) {
  const token = getAuthToken();

  // Try server save if logged in
  if (token) {
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

  // Offline save
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
    flashed_count: 0,
    created_at: new Date().toISOString()
  };

  saveOfflineArtwork(offlineArt);
  return offlineArt;
}

export async function deleteArtwork(id) {
  // If local offline artwork
  if (id.startsWith('local_')) {
    deleteOfflineArtwork(id);
    return true;
  }

  const token = getAuthToken();
  if (token) {
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

// Offline Storage Helpers
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
    // Keep max 50 offline records to avoid localStorage overflow
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
  } catch (_) {}
}

// 4. Config & Presets
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
    { id: 'gallery_matte', name: '画廊留白 (Gallery Matte)', aspect: '4:3' },
    { id: 'minimal_edge', name: '全屏无边框 (Full Bleed)', aspect: '4:3' }
  ];
}

export async function fetchConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (res.ok) {
      const data = await res.json();
      return data.data;
    }
  } catch (e) {
    console.warn('Backend /v1/config unreachable, using default display profile');
  }

  return {
    display_profile: {
      width: 400,
      height: 300,
      color_count: 4,
      frame_bytes: 30000,
      bpp: 2
    },
    ticket_public_key: 'offline_ed25519_demo_key'
  };
}

export async function recordFlashTelemetry(record) {
  try {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_BASE}/telemetry/flash`, {
      method: 'POST',
      headers,
      body: JSON.stringify(record)
    });
  } catch (e) {
    console.warn('Telemetry flash record skipped (offline):', e.message);
  }
}
