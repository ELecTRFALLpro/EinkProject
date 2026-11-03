/**
 * 2-bit MSB-First Hardware Pixel Packer
 * Target: 4.01" 400x300 E-Paper controller IC
 * 400 x 300 = 120,000 pixels
 * 2 bits per pixel => 4 pixels per byte => exactly 30,000 bytes.
 *
 * Mapping:
 *   00b (0) = Black
 *   01b (1) = White
 *   10b (2) = Yellow
 *   11b (3) = Red
 */

export const EXPECTED_WIDTH = 400;
export const EXPECTED_HEIGHT = 300;
export const TOTAL_PIXELS = EXPECTED_WIDTH * EXPECTED_HEIGHT; // 120000
export const EXPECTED_BYTE_SIZE = TOTAL_PIXELS / 4; // 30000

/**
 * Pack a 1D array of 120,000 color indices into 30,000 bytes.
 * @param {Uint8Array|Array<number>} indices Array of indices (0..3)
 * @returns {Uint8Array} 30,000 bytes binary buffer
 */
export function pack2BitMSB(indices) {
  if (indices.length !== TOTAL_PIXELS) {
    throw new Error(`Invalid pixel count: got ${indices.length}, expected ${TOTAL_PIXELS}`);
  }

  const packed = new Uint8Array(EXPECTED_BYTE_SIZE);

  for (let i = 0; i < EXPECTED_BYTE_SIZE; i++) {
    const p0 = indices[i * 4] & 0x03;
    const p1 = indices[i * 4 + 1] & 0x03;
    const p2 = indices[i * 4 + 2] & 0x03;
    const p3 = indices[i * 4 + 3] & 0x03;

    packed[i] = (p0 << 6) | (p1 << 4) | (p2 << 2) | p3;
  }

  return packed;
}

/**
 * Unpack 30,000 bytes back into 120,000 color indices
 * Useful for validating received NFC frames.
 */
export function unpack2BitMSB(buffer) {
  if (buffer.length !== EXPECTED_BYTE_SIZE) {
    throw new Error(`Invalid buffer size: got ${buffer.length}, expected ${EXPECTED_BYTE_SIZE}`);
  }

  const indices = new Uint8Array(TOTAL_PIXELS);

  for (let i = 0; i < EXPECTED_BYTE_SIZE; i++) {
    const b = buffer[i];
    indices[i * 4]     = (b >> 6) & 0x03;
    indices[i * 4 + 1] = (b >> 4) & 0x03;
    indices[i * 4 + 2] = (b >> 2) & 0x03;
    indices[i * 4 + 3] = b & 0x03;
  }

  return indices;
}

/**
 * Trigger download of binary payload in browser
 */
export function downloadBinaryFile(uint8Array, filename = 'eink_frame_400x300.bin') {
  const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger download of image preview (PNG)
 */
export function downloadCanvasAsPNG(canvas, filename = 'eink_preview.png') {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
