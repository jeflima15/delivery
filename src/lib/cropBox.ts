export type BoundingBox = [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalizados de 0 a 1000

export interface BoxPercent {
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface BoxPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converte coordenadas normalizadas 0-1000 para porcentagens CSS (0% - 100%)
 * para renderização de overlays e caixas sobre a imagem.
 */
export function boxToPercent(box: BoundingBox): BoxPercent {
  const [ymin, xmin, ymax, xmax] = box;
  const top = (Math.max(0, Math.min(1000, ymin)) / 10).toFixed(2);
  const left = (Math.max(0, Math.min(1000, xmin)) / 10).toFixed(2);
  const width = (Math.max(0, Math.min(1000, xmax - xmin)) / 10).toFixed(2);
  const height = (Math.max(0, Math.min(1000, ymax - ymin)) / 10).toFixed(2);

  return {
    top: `${top}%`,
    left: `${left}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

/**
 * Converte coordenadas normalizadas 0-1000 para pixels reais
 * respeitando as dimensões naturais da imagem.
 */
export function boxToPixels(
  box: BoundingBox,
  naturalWidth: number,
  naturalHeight: number
): BoxPixels {
  const [ymin, xmin, ymax, xmax] = box;

  const rawX = (xmin / 1000) * naturalWidth;
  const rawY = (ymin / 1000) * naturalHeight;
  const rawW = ((xmax - xmin) / 1000) * naturalWidth;
  const rawH = ((ymax - ymin) / 1000) * naturalHeight;

  const x = Math.max(0, Math.min(naturalWidth, Math.round(rawX)));
  const y = Math.max(0, Math.min(naturalHeight, Math.round(rawY)));
  const width = Math.max(1, Math.min(naturalWidth - x, Math.round(rawW)));
  const height = Math.max(1, Math.min(naturalHeight - y, Math.round(rawH)));

  return { x, y, width, height };
}

/**
 * Realiza o crop da região demarcada por photoBox em um elemento de Canvas
 * no navegador e retorna o DataURL correspondente para renderização de prévia.
 */
export function cropImageToDataUrl(
  img: HTMLImageElement,
  box: BoundingBox,
  maxCanvasDimension = 400
): string | null {
  if (typeof document === 'undefined') return null;
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const { x, y, width, height } = boxToPixels(box, img.naturalWidth, img.naturalHeight);
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');

  // Redimensiona proporcionalmente para não gerar DataURLs pesadas no DOM
  let targetWidth = width;
  let targetHeight = height;
  if (targetWidth > maxCanvasDimension || targetHeight > maxCanvasDimension) {
    if (targetWidth > targetHeight) {
      targetHeight = Math.round((targetHeight * maxCanvasDimension) / targetWidth);
      targetWidth = maxCanvasDimension;
    } else {
      targetWidth = Math.round((targetWidth * maxCanvasDimension) / targetHeight);
      targetHeight = maxCanvasDimension;
    }
  }

  canvas.width = Math.max(1, targetWidth);
  canvas.height = Math.max(1, targetHeight);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}
