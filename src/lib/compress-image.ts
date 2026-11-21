// Browser-only photo compression so phone photos fit Vercel's ~4.5 MB request body limit.
// Canvas export drops EXIF (including GPS), which is what we want. On any failure the
// original file is returned; the server re-encodes it and rejects anything over 12 MB.

const SKIP_BYTES = 1.5 * 1024 * 1024;
const MAX_BYTES = 4 * 1024 * 1024;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image could not be decoded'));
        img.src = url;
      });
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

function render(img: Decoded, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas not available'));
  ctx.fillStyle = '#fff'; // JPEG has no transparency: flatten PNG/WebP onto white, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img.source, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality);
  });
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.jpg`;
}

/** Shrinks a photo to a JPEG with the longest side <= maxSide. Returns the original file if it is not an image, is already small, or anything fails. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  let img: Decoded | null = null;
  try {
    img = await decode(file);
    if (!img.width || !img.height) return file;
    const longest = Math.max(img.width, img.height);
    if (file.size <= SKIP_BYTES && longest <= maxSide) return file;

    let blob = await render(img, maxSide, quality);
    if (blob.size > MAX_BYTES) blob = await render(img, Math.min(maxSide, 1280), 0.6);
    // Already-small originals that re-encode larger: keep the original (the server strips metadata).
    if (blob.size >= file.size && file.size <= MAX_BYTES && longest <= maxSide) return file;

    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    img?.close();
  }
}
