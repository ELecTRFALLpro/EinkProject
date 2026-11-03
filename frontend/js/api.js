/**
 * Backend API Client for EinkProject
 * Supports both live Go API endpoints and graceful offline fallback mode.
 */

const API_BASE = window.location.origin.includes('8080')
  ? '/v1'
  : 'http://localhost:8080/v1';

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

  // Local fallback manifest
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
    await fetch(`${API_BASE}/telemetry/flash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
  } catch (e) {
    console.warn('Telemetry flash record skipped (offline):', e.message);
  }
}
