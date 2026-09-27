import type { BoundingBox } from './cropBox';
import { boxToPixels } from './cropBox';
import type { NormalizedSourceEvidence } from './catalogImportDomain';

/**
 * Determina se um tipo semântico é elegível a possuir foto própria no catálogo do Pode Vir.
 * Conforme regras de domínio, apenas produtos principais e combos possuem foto própria.
 * Opções, adicionais, variantes e informativos NÃO são donos de foto no catálogo.
 */
export function isCatalogPhotoCandidate(kind: string | null | undefined): boolean {
  return kind === 'product' || kind === 'combo';
}

export interface PdfPhotoCandidateItem {
  itemKey: string;
  name: string;
  kind: string;
  categoryName?: string | null;
  pageNumber: number;
  photoBox: BoundingBox;
  photoRelation: NormalizedSourceEvidence['photos'][number]['photoRelation'];
  photoWarning?: string | null;
}

export interface ExtractPdfCropsResult {
  crops: Record<string, string>; // itemKey -> dataUrl do crop
  pagePreviews: Record<number, string>; // pageNumber -> dataUrl da página inteira para overlay
  renderedPages: number[]; // Lista de números de páginas efetivamente renderizadas
  failedItemKeys: Record<string, string>; // itemKey -> mensagem de falha na renderização se houver
}

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * Carregamento dinâmico (lazy) de pdfjs-dist configurando o worker local do Vite.
 * Não adiciona PDF.js ao bundle inicial do painel.
 */
export async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs;
    })();
  }
  return pdfjsLibPromise;
}

/**
 * Calcula a escala de renderização da página de PDF para que sua maior dimensão
 * fique entre 2000 e 2500 px, garantindo nitidez para auditoria sem estourar memória.
 */
export function calculatePageRenderScale(
  unscaledWidth: number,
  unscaledHeight: number,
  targetMaxDim = 2200
): number {
  const maxNatural = Math.max(unscaledWidth, unscaledHeight);
  if (maxNatural <= 0) return 1.5;
  const idealScale = targetMaxDim / maxNatural;
  return Math.max(1.0, Math.min(3.0, Number(idealScale.toFixed(2))));
}

/**
 * Renderiza uma página específica do PDF em um elemento HTMLCanvasElement offscreen.
 */
export async function renderPdfPageToCanvas(
  pdfDoc: any,
  pageNumber: number
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = calculatePageRenderScale(unscaledViewport.width, unscaledViewport.height, 2200);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível obter o contexto 2D do Canvas para renderizar o PDF.');
  }

  const renderContext = {
    canvasContext: context,
    viewport,
  };

  await page.render(renderContext).promise;
  return canvas;
}

/**
 * Recorta a região demarcada por photoBox (0..1000) a partir de um Canvas de página
 * e retorna a DataURL correspondente em resolução apropriada para cards.
 */
export function cropCanvasRegionToDataUrl(
  sourceCanvas: HTMLCanvasElement,
  box: BoundingBox,
  maxDimension = 500
): string | null {
  if (typeof document === 'undefined') return null;
  if (!sourceCanvas.width || !sourceCanvas.height) return null;

  const { x, y, width, height } = boxToPixels(box, sourceCanvas.width, sourceCanvas.height);
  if (width <= 0 || height <= 0) return null;

  const cropCanvas = document.createElement('canvas');

  let targetW = width;
  let targetH = height;
  if (targetW > maxDimension || targetH > maxDimension) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDimension) / targetW);
      targetW = maxDimension;
    } else {
      targetW = Math.round((targetW * maxDimension) / targetH);
      targetH = maxDimension;
    }
  }

  cropCanvas.width = Math.max(1, targetW);
  cropCanvas.height = Math.max(1, targetH);

  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, cropCanvas.width, cropCanvas.height);
    return cropCanvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

/**
 * Orquestrador de recorte de fotos para PDFs:
 * 1. Filtra estritamente os itens candidatos de catálogo (product e combo).
 * 2. Calcula pagesNeeded apenas a partir desses candidatos.
 * 3. Renderiza cada página necessária UMA ÚNICA VEZ.
 * 4. Produz os crops e salva os previews de página para auditoria ("Ver na página").
 */
export async function extractPdfCrops(
  file: File,
  candidates: PdfPhotoCandidateItem[]
): Promise<ExtractPdfCropsResult> {
  const result: ExtractPdfCropsResult = {
    crops: {},
    pagePreviews: {},
    renderedPages: [],
    failedItemKeys: {},
  };

  // Filtro de domínio: APENAS produtos e combos com foto válida
  const validCandidates = candidates.filter(
    (item) =>
      isCatalogPhotoCandidate(item.kind) &&
      item.photoRelation !== 'none' &&
      Array.isArray(item.photoBox) &&
      item.photoBox.length === 4 &&
      typeof item.pageNumber === 'number' &&
      item.pageNumber >= 1
  );

  if (validCandidates.length === 0) {
    return result;
  }

  // Conjunto estrito de páginas necessárias
  const pagesNeeded = Array.from(new Set(validCandidates.map((c) => c.pageNumber))).sort(
    (a, b) => a - b
  );

  const candidatesByPage = new Map<number, PdfPhotoCandidateItem[]>();
  validCandidates.forEach((c) => {
    const list = candidatesByPage.get(c.pageNumber) || [];
    list.push(c);
    candidatesByPage.set(c.pageNumber, list);
  });

  try {
    const pdfjs = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    for (const pageNum of pagesNeeded) {
      try {
        const pageCanvas = await renderPdfPageToCanvas(pdfDoc, pageNum);
        result.renderedPages.push(pageNum);

        try {
          result.pagePreviews[pageNum] = pageCanvas.toDataURL('image/jpeg', 0.75);
        } catch {
          // Ignora se dataUrl da página inteira exceder memória
        }

        const pageCandidates = candidatesByPage.get(pageNum) || [];
        for (const candidate of pageCandidates) {
          const cropUrl = cropCanvasRegionToDataUrl(pageCanvas, candidate.photoBox, 500);
          if (cropUrl) {
            result.crops[candidate.itemKey] = cropUrl;
          } else {
            result.failedItemKeys[candidate.itemKey] =
              'Foto identificada pela IA, mas não foi possível gerar a prévia desta página do PDF.';
          }
        }
      } catch {
        const pageCandidates = candidatesByPage.get(pageNum) || [];
        pageCandidates.forEach((c) => {
          result.failedItemKeys[c.itemKey] =
            'Foto identificada pela IA, mas não foi possível gerar a prévia desta página do PDF.';
        });
      }
    }

    try {
      await (pdfDoc as any).destroy?.();
      await (pdfDoc as any).cleanup?.();
    } catch {
      // Ignora erro no encerramento
    }
  } catch {
    validCandidates.forEach((c) => {
      result.failedItemKeys[c.itemKey] =
        'Foto identificada pela IA, mas não foi possível gerar a prévia desta página do PDF.';
    });
  }

  return result;
}
