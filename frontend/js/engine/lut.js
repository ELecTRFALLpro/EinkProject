/**
 * 3D Color LUT Engine & Advanced Digital Darkroom Adjustment Pipeline
 * Optimized for Mobile (iOS Safari & Chrome) with 60fps Canvas processing.
 */

export class ParsedLUT {
  constructor(size, data, title = '') {
    this.size = size; // e.g. 32
    this.data = data; // Float32Array of size * size * size * 3
    this.title = title;
  }

  sample(r, g, b) {
    const size = this.size;
    const maxIdx = size - 1;

    const x = Math.min(maxIdx, Math.max(0, r * maxIdx));
    const y = Math.min(maxIdx, Math.max(0, g * maxIdx));
    const z = Math.min(maxIdx, Math.max(0, b * maxIdx));

    const x0 = Math.floor(x);
    const x1 = Math.min(maxIdx, x0 + 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(maxIdx, y0 + 1);
    const z0 = Math.floor(z);
    const z1 = Math.min(maxIdx, z0 + 1);

    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;

    const data = this.data;
    const strideY = size * 3;
    const strideZ = size * size * 3;

    const getRGB = (ix, iy, iz) => {
      const idx = iz * strideZ + iy * strideY + ix * 3;
      return [data[idx], data[idx + 1], data[idx + 2]];
    };

    const c000 = getRGB(x0, y0, z0);
    const c100 = getRGB(x1, y0, z0);
    const c010 = getRGB(x0, y1, z0);
    const c110 = getRGB(x1, y1, z0);
    const c001 = getRGB(x0, y0, z1);
    const c101 = getRGB(x1, y0, z1);
    const c011 = getRGB(x0, y1, z1);
    const c111 = getRGB(x1, y1, z1);

    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c00 = c000[c] * (1 - fx) + c100[c] * fx;
      const c01 = c001[c] * (1 - fx) + c101[c] * fx;
      const c10 = c010[c] * (1 - fx) + c110[c] * fx;
      const c11 = c011[c] * (1 - fx) + c111[c] * fx;

      const c0 = c00 * (1 - fy) + c10 * fy;
      const c1 = c01 * (1 - fy) + c11 * fy;

      out[c] = c0 * (1 - fz) + c1 * fz;
    }

    return out;
  }
}

const lutCache = new Map();

export function parseCubeLUT(cubeText) {
  const lines = cubeText.split(/\r?\n/);
  let size = 0;
  let title = '';
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      title = line.replace(/^TITLE\s+["']?|["']?$/g, '');
      continue;
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }

    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) {
      continue;
    }

    const tokens = line.split(/\s+/);
    if (tokens.length >= 3) {
      const r = parseFloat(tokens[0]);
      const g = parseFloat(tokens[1]);
      const b = parseFloat(tokens[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        entries.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    const totalTriplets = entries.length / 3;
    size = Math.round(Math.cbrt(totalTriplets));
  }

  const expectedCount = size * size * size * 3;
  if (entries.length < expectedCount) {
    throw new Error(`Incomplete LUT data: got ${entries.length / 3} points, expected ${size ** 3}`);
  }

  const data = new Float32Array(entries.slice(0, expectedCount));
  return new ParsedLUT(size, data, title);
}

export async function loadCubeLUT(url) {
  if (lutCache.has(url)) {
    return lutCache.get(url);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch LUT from ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const lut = parseCubeLUT(text);
  lutCache.set(url, lut);
  return lut;
}

/**
 * Apply 3D LUT to an ImageData object
 */
export function applyLUTToImageData(lut, sourceImageData, intensity = 1.0) {
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const src = sourceImageData.data;

  const destImageData = new ImageData(width, height);
  const dst = destImageData.data;
  const len = width * height;
  const inv255 = 1 / 255;

  for (let i = 0; i < len; i++) {
    const offset = i * 4;
    const rNorm = src[offset] * inv255;
    const gNorm = src[offset + 1] * inv255;
    const bNorm = src[offset + 2] * inv255;

    const [lr, lg, lb] = lut.sample(rNorm, gNorm, bNorm);

    if (intensity >= 0.999) {
      dst[offset]     = Math.min(255, Math.max(0, Math.round(lr * 255)));
      dst[offset + 1] = Math.min(255, Math.max(0, Math.round(lg * 255)));
      dst[offset + 2] = Math.min(255, Math.max(0, Math.round(lb * 255)));
    } else {
      const invInt = 1 - intensity;
      dst[offset]     = Math.min(255, Math.max(0, Math.round((rNorm * invInt + lr * intensity) * 255)));
      dst[offset + 1] = Math.min(255, Math.max(0, Math.round((gNorm * invInt + lg * intensity) * 255)));
      dst[offset + 2] = Math.min(255, Math.max(0, Math.round((bNorm * invInt + lb * intensity) * 255)));
    }
    dst[offset + 3] = src[offset + 3];
  }

  return destImageData;
}

/**
 * Advanced Darkroom Parametric Grading:
 *   - Brightness (-100 .. +100)
 *   - Contrast (0.5 .. 1.8)
 *   - Saturation (0.0 .. 2.0)
 *   - Warmth / Tint (-50 .. +50)
 *   - Sharpness (0.0 .. 1.0)
 */
export function applyParametricAdjustments(sourceImageData, {
  brightness = 0,
  contrast = 1.0,
  saturation = 1.0,
  warmth = 0,
  sharpness = 0
} = {}) {
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const src = sourceImageData.data;

  const dest = new ImageData(width, height);
  const dst = dest.data;
  const len = width * height;

  const bOffset = brightness * 1.28; // -64 .. +64
  const wShift = warmth * 0.7; // shift red positive, blue negative

  for (let i = 0; i < len; i++) {
    const o = i * 4;
    let r = src[o] + bOffset;
    let g = src[o + 1] + bOffset;
    let b = src[o + 2] + bOffset;

    // Warmth adjustment
    if (wShift !== 0) {
      r += wShift;
      b -= wShift;
    }

    // Contrast adjustment
    if (contrast !== 1.0) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }

    // Saturation adjustment
    if (saturation !== 1.0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }

    dst[o]     = Math.min(255, Math.max(0, Math.round(r)));
    dst[o + 1] = Math.min(255, Math.max(0, Math.round(g)));
    dst[o + 2] = Math.min(255, Math.max(0, Math.round(b)));
    dst[o + 3] = src[o + 3];
  }

  // Apply unsharp mask sharpening if requested
  if (sharpness > 0.05) {
    applyUnsharpMask(dst, width, height, sharpness);
  }

  return dest;
}

/**
 * 3x3 Laplacian Unsharp Mask Filter
 * Crucial for low-resolution 400x300 e-ink displays to accentuate details and prevent muddy dithering.
 */
function applyUnsharpMask(pixels, width, height, amount = 0.5) {
  const copy = new Uint8Array(pixels);
  const factor = amount * 1.5;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const up     = copy[((y - 1) * width + x) * 4 + c];
        const down   = copy[((y + 1) * width + x) * 4 + c];
        const left   = copy[(y * width + (x - 1)) * 4 + c];
        const right  = copy[(y * width + (x + 1)) * 4 + c];

        // Laplacian kernel: 5 * center - (up + down + left + right)
        const laplacian = 4 * center - up - down - left - right;
        const sharpened = center + laplacian * factor;
        pixels[idx + c] = Math.min(255, Math.max(0, Math.round(sharpened)));
      }
    }
  }
}
