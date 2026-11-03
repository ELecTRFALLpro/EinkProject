/**
 * E-Ink 4-Color Quantization & Dithering Engine
 * Target: 4.01" 400x300 E-Paper (Black, White, Yellow, Red)
 */

export const PALETTE = [
  { id: 0, name: 'black',  rgb: [24, 24, 24],    label: '黑 (Black)' },
  { id: 1, name: 'white',  rgb: [245, 242, 235], label: '白 (White)' },
  { id: 2, name: 'yellow', rgb: [244, 196, 48],  label: '黄 (Yellow)' },
  { id: 3, name: 'red',    rgb: [216, 38, 44],   label: '红 (Red)' }
];

/**
 * Perceptual Redmean color distance with red-damper factor.
 * In 4-color e-ink, saturated red pigment tends to dominate facial tones and skin highlights.
 * The redDamper dynamically penalizes selecting Red unless the pixel is genuinely high saturation red.
 */
export function colorDistanceRedmean(r1, g1, b1, r2, g2, b2, isTargetRed = false, redDamper = 1.15) {
  const rBar = (r1 + r2) / 2;
  const dR = r1 - r2;
  const dG = g1 - g2;
  const dB = b1 - b2;

  let dist = (2 + rBar / 256) * (dR * dR) +
             4 * (dG * dG) +
             (2 + (255 - rBar) / 256) * (dB * dB);

  if (isTargetRed) {
    dist *= redDamper;
  }
  return dist;
}

/**
 * Find closest palette color
 */
export function getClosestPaletteColor(r, g, b, redDamper = 1.15) {
  let bestIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < PALETTE.length; i++) {
    const p = PALETTE[i].rgb;
    const isRed = (i === 3);
    const dist = colorDistanceRedmean(r, g, b, p[0], p[1], p[2], isRed, redDamper);
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Atkinson Dithering Algorithm
 * Diffuses 6/8 (75%) of error to 6 neighbors (1/8 each), discarding 2/8 (25%) residual error.
 * Preserves crisp edges, prevents muddy shadow bleeding, ideal for portrait & e-ink displays.
 */
export function ditherAtkinson(sourceImageData, redDamper = 1.15) {
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const src = sourceImageData.data;

  // Float buffer for accumulating error diffusion
  const bufR = new Float32Array(width * height);
  const bufG = new Float32Array(width * height);
  const bufB = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    bufR[i] = src[i * 4];
    bufG[i] = src[i * 4 + 1];
    bufB[i] = src[i * 4 + 2];
  }

  const outIndices = new Uint8Array(width * height);
  const outImageData = new ImageData(width, height);
  const out = outImageData.data;

  const counts = [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      const oldR = Math.min(255, Math.max(0, bufR[idx]));
      const oldG = Math.min(255, Math.max(0, bufG[idx]));
      const oldB = Math.min(255, Math.max(0, bufB[idx]));

      const colorIdx = getClosestPaletteColor(oldR, oldG, oldB, redDamper);
      outIndices[idx] = colorIdx;
      counts[colorIdx]++;

      const chosenRGB = PALETTE[colorIdx].rgb;
      const targetR = chosenRGB[0];
      const targetG = chosenRGB[1];
      const targetB = chosenRGB[2];

      const outOffset = idx * 4;
      out[outOffset] = targetR;
      out[outOffset + 1] = targetG;
      out[outOffset + 2] = targetB;
      out[outOffset + 3] = 255;

      const errR = (oldR - targetR) / 8;
      const errG = (oldG - targetG) / 8;
      const errB = (oldB - targetB) / 8;

      // Atkinson error kernel distribution:
      //         [x]   +1   +2
      //   -1    +0    +1
      //         +0 (y+2)
      const offsets = [
        [x + 1, y],
        [x + 2, y],
        [x - 1, y + 1],
        [x,     y + 1],
        [x + 1, y + 1],
        [x,     y + 2]
      ];

      for (let k = 0; k < offsets.length; k++) {
        const nx = offsets[k][0];
        const ny = offsets[k][1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          bufR[nIdx] += errR;
          bufG[nIdx] += errG;
          bufB[nIdx] += errB;
        }
      }
    }
  }

  const totalPixels = width * height;
  const stats = {
    total: totalPixels,
    counts,
    percentages: {
      black: ((counts[0] / totalPixels) * 100).toFixed(1) + '%',
      white: ((counts[1] / totalPixels) * 100).toFixed(1) + '%',
      yellow: ((counts[2] / totalPixels) * 100).toFixed(1) + '%',
      red: ((counts[3] / totalPixels) * 100).toFixed(1) + '%'
    }
  };

  return {
    indices: outIndices,
    imageData: outImageData,
    stats
  };
}

/**
 * Floyd-Steinberg Dithering Algorithm
 * Diffuses 100% of error (7/16, 3/16, 5/16, 1/16).
 * Smooth gradient transitions, suited for open skies and continuous landscapes.
 */
export function ditherFloydSteinberg(sourceImageData, redDamper = 1.15) {
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const src = sourceImageData.data;

  const bufR = new Float32Array(width * height);
  const bufG = new Float32Array(width * height);
  const bufB = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    bufR[i] = src[i * 4];
    bufG[i] = src[i * 4 + 1];
    bufB[i] = src[i * 4 + 2];
  }

  const outIndices = new Uint8Array(width * height);
  const outImageData = new ImageData(width, height);
  const out = outImageData.data;

  const counts = [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      const oldR = Math.min(255, Math.max(0, bufR[idx]));
      const oldG = Math.min(255, Math.max(0, bufG[idx]));
      const oldB = Math.min(255, Math.max(0, bufB[idx]));

      const colorIdx = getClosestPaletteColor(oldR, oldG, oldB, redDamper);
      outIndices[idx] = colorIdx;
      counts[colorIdx]++;

      const chosenRGB = PALETTE[colorIdx].rgb;
      const targetR = chosenRGB[0];
      const targetG = chosenRGB[1];
      const targetB = chosenRGB[2];

      const outOffset = idx * 4;
      out[outOffset] = targetR;
      out[outOffset + 1] = targetG;
      out[outOffset + 2] = targetB;
      out[outOffset + 3] = 255;

      const diffR = oldR - targetR;
      const diffG = oldG - targetG;
      const diffB = oldB - targetB;

      // Floyd-Steinberg kernel:
      //       [x]  7/16
      // 3/16  5/16 1/16
      if (x + 1 < width) {
        const nIdx = y * width + (x + 1);
        bufR[nIdx] += diffR * (7 / 16);
        bufG[nIdx] += diffG * (7 / 16);
        bufB[nIdx] += diffB * (7 / 16);
      }
      if (y + 1 < height) {
        if (x - 1 >= 0) {
          const nIdx = (y + 1) * width + (x - 1);
          bufR[nIdx] += diffR * (3 / 16);
          bufG[nIdx] += diffG * (3 / 16);
          bufB[nIdx] += diffB * (3 / 16);
        }
        const nIdxDown = (y + 1) * width + x;
        bufR[nIdxDown] += diffR * (5 / 16);
        bufG[nIdxDown] += diffG * (5 / 16);
        bufB[nIdxDown] += diffB * (5 / 16);

        if (x + 1 < width) {
          const nIdxDownRight = (y + 1) * width + (x + 1);
          bufR[nIdxDownRight] += diffR * (1 / 16);
          bufG[nIdxDownRight] += diffG * (1 / 16);
          bufB[nIdxDownRight] += diffB * (1 / 16);
        }
      }
    }
  }

  const totalPixels = width * height;
  const stats = {
    total: totalPixels,
    counts,
    percentages: {
      black: ((counts[0] / totalPixels) * 100).toFixed(1) + '%',
      white: ((counts[1] / totalPixels) * 100).toFixed(1) + '%',
      yellow: ((counts[2] / totalPixels) * 100).toFixed(1) + '%',
      red: ((counts[3] / totalPixels) * 100).toFixed(1) + '%'
    }
  };

  return {
    indices: outIndices,
    imageData: outImageData,
    stats
  };
}
