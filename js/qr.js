// QR decode (jsQR, loaded as a classic script → globalThis.jsQR) and
// byte-exact re-encode (qrcode-generator, byte mode).
import qrcode from '../vendor/qrcode.mjs';

/** @returns {{bytes:number[], text:string} | null} */
export function decodeQr({ data, width, height }) {
  const jsQR = globalThis.jsQR;
  if (!jsQR) throw new Error('jsQR not loaded');
  const r = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (!r || !r.binaryData.length) return null;
  return { bytes: Array.from(r.binaryData), text: r.data };
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
