// QR decode (jsQR, loaded as a classic script → globalThis.jsQR) and
// byte-exact re-encode (qrcode-generator, byte mode).
import qrcode from '../vendor/qrcode.mjs';

/** @returns {{bytes:number[], text:string, rect:{x,y,w,h}} | null} rect = QR bounds in input px */
export function decodeQr({ data, width, height }) {
  const jsQR = globalThis.jsQR;
  if (!jsQR) throw new Error('jsQR not loaded');
  const r = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (!r || !r.binaryData.length) return null;
  const l = r.location;
  const xs = [l.topLeftCorner.x, l.topRightCorner.x, l.bottomLeftCorner.x, l.bottomRightCorner.x];
  const ys = [l.topLeftCorner.y, l.topRightCorner.y, l.bottomLeftCorner.y, l.bottomRightCorner.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const rect = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  return { bytes: Array.from(r.binaryData), text: r.data, rect };
}

/** Grayscale copy with the darkest 1% → black and brightest 1% → white (fixes dim / washed-out photos). */
export function stretchContrast({ data, width, height }) {
  const n = width * height;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    gray[i] = g;
    hist[gray[i]]++;
  }
  const cut = n * 0.01;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < cut; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < cut; hi--);
  const range = Math.max(1, hi - lo);
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = ((gray[i] - lo) * 255) / range;
    out[p + 3] = 255;
  }
  return { data: out, width, height };
}

/** Global Otsu threshold → pure black/white (helps glare and uneven printing). */
export function binarize({ data, width, height }) {
  const n = width * height;
  const gray = new Uint8Array(n);
  const hist = new Float64Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    hist[gray[i]]++;
  }
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = gray[i] > threshold ? 255 : 0;
    out[p + 3] = 255;
  }
  return { data: out, width, height };
}

/** Try the image as-is, then contrast-stretched, then binarized. */
export function decodeWithVariants(imageData) {
  return decodeQr(imageData) ?? decodeQr(stretchContrast(imageData)) ?? decodeQr(binarize(imageData));
}

/** True when re-encoding the bytes decodes back to exactly the same bytes. */
export function verifyReencode(bytes) {
  try {
    const back = decodeQr(matrixToImageData(encodeQr(bytes), 4, 4));
    return !!back && back.bytes.length === bytes.length && back.bytes.every((b, i) => b === bytes[i]);
  } catch {
    return false; // e.g. payload too long for any QR version
  }
}

/** Byte-mode encode of the exact bytes, error correction M. */
export function encodeQr(bytes) {
  const qr = qrcode(0, 'M');
  // default stringToBytes maps each charCode & 0xff → byte, so this is lossless
  qr.addData(String.fromCharCode(...bytes), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return { size, isDark: (r, c) => qr.isDark(r, c) };
}

/** Rasterize a matrix to RGBA (used for verify-after-encode and tests). */
export function matrixToImageData(matrix, scale = 4, margin = 4) {
  const width = (matrix.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        let i = (((r + margin) * scale + y) * width + (c + margin) * scale) * 4;
        for (let x = 0; x < scale; x++, i += 4) data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width, height: width };
}
