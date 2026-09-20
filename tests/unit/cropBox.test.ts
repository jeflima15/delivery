import { describe, expect, it } from 'vitest';
import { boxToPercent, boxToPixels, type BoundingBox } from '../../src/lib/cropBox.js';

describe('cropBox: utilitários de coordenadas normalizadas', () => {
  it('converte bounding box completa [0, 0, 1000, 1000] para 100% em porcentagens', () => {
    const fullBox: BoundingBox = [0, 0, 1000, 1000];
    const percent = boxToPercent(fullBox);

    expect(percent).toEqual({
      top: '0.00%',
      left: '0.00%',
      width: '100.00%',
      height: '100.00%',
    });
  });

  it('converte recorte parcial em porcentagens com precisão de 2 casas decimais', () => {
    // ymin: 120, xmin: 60, ymax: 260, xmax: 410
    // top = 12.00%, left = 6.00%, width = (410 - 60)/10 = 35.00%, height = (260 - 120)/10 = 14.00%
    const box: BoundingBox = [120, 60, 260, 410];
    const percent = boxToPercent(box);

    expect(percent).toEqual({
      top: '12.00%',
      left: '6.00%',
      width: '35.00%',
      height: '14.00%',
    });
  });

  it('converte [0, 0, 1000, 1000] em pixels cobrindo a imagem completa', () => {
    const fullBox: BoundingBox = [0, 0, 1000, 1000];
    const naturalWidth = 1920;
    const naturalHeight = 1080;

    const pixels = boxToPixels(fullBox, naturalWidth, naturalHeight);
    expect(pixels).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('converte recorte parcial em pixels arredondados com dimensões reais da imagem', () => {
    // ymin: 250 (25%), xmin: 500 (50%), ymax: 750 (75%), xmax: 1000 (100%)
    // largura: 1000px, altura: 2000px
    // x = 500, y = 500, width = 500, height = 1000
    const box: BoundingBox = [250, 500, 750, 1000];
    const pixels = boxToPixels(box, 1000, 2000);

    expect(pixels).toEqual({
      x: 500,
      y: 500,
      width: 500,
      height: 1000,
    });
  });

  it('garante limites seguros mesmo se coordenadas ultrapassarem 1000', () => {
    const outOfBoundsBox: BoundingBox = [-50, -20, 1050, 1100];
    const pixels = boxToPixels(outOfBoundsBox, 800, 600);

    expect(pixels.x).toBeGreaterThanOrEqual(0);
    expect(pixels.y).toBeGreaterThanOrEqual(0);
    expect(pixels.x + pixels.width).toBeLessThanOrEqual(800);
    expect(pixels.y + pixels.height).toBeLessThanOrEqual(600);
  });
});
