// A visual-only preference shared by local and online games on this device.
// Keep it independent of match settings so changing text cannot reset a turn.
const STORAGE_KEY = 'arena-game-text-size-v1';
const SIZES = new Set(['normal', 'large', 'largest']);

export function getTextSize() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SIZES.has(saved) ? saved : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size = getTextSize()) {
  const validSize = SIZES.has(size) ? size : 'normal';
  document.documentElement.dataset.arenaTextSize = validSize;
  return validSize;
}

export function setTextSize(size) {
  const validSize = applyTextSize(size);
  try { localStorage.setItem(STORAGE_KEY, validSize); } catch { /* Optional preference. */ }
  return validSize;
}

applyTextSize();
