// Bytes (a downloaded photo) as base64 text, to show them as a "data:" picture. Written out here so the app needs no
// extra package: React Native's Blob reader is slow and warns about it (see components/avatar.tsx).

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array) {
  let text = '';
  // Every 3 bytes (24 bits) become 4 letters of 6 bits each; a short last group is padded with "="
  for (let i = 0; i < bytes.length; i += 3) {
    const group = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    text += LETTERS[(group >> 18) & 63] + LETTERS[(group >> 12) & 63];
    text += i + 1 < bytes.length ? LETTERS[(group >> 6) & 63] : '=';
    text += i + 2 < bytes.length ? LETTERS[group & 63] : '=';
  }
  return text;
}
