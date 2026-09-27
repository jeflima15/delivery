import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../server/middleware/errors.js';
import { DOMAIN_NATIVE_SYSTEM_INSTRUCTION } from '../../server/services/catalogImportPreprocessor.js';
import { preflightPdfSignedUrl, analyzeMenuDomainNativeWithGemini } from '../../server/services/catalogImportAiService.js';
import { domainNativeJsonSchema, DOMAIN_NATIVE_GENERATION_SEED } from '../../src/lib/catalogImportDomain.js';
import { emanueleConfeitariaDomainRawFixture } from '../fixtures/catalogImportFixtures.js';
const toArrayBuffer = (buf: Buffer): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
describe('Catalog import analysis', () => {
  describe('2. Preflight HTTP Range do PDF (preflightPdfSignedUrl)', () => {
    it('5. aceita resposta HTTP 206 com cabeçalho %PDF- e content-range dentro do limite', async () => {
      const fakePdfHeader = '%PDF-1.7\n%âãÏÓ\n1 0 obj\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === 'content-range') return 'bytes 0-1023/5242880';
            if (header.toLowerCase() === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      const result = await preflightPdfSignedUrl('https://storage.example.com/menu.pdf?token=xyz', mockFetch as any);

      expect(result.isValidPdf).toBe(true);
      expect(result.headerSnippet).toBe('%PDF-1.7');
      expect(result.detectedSizeBytes).toBe(5242880);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://storage.example.com/menu.pdf?token=xyz',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-1023' }),
        })
      );
    });

    it('6. aceita resposta HTTP 200 com magic number %PDF- quando servidor ignora range mas tem tamanho válido', async () => {
      const fakePdfHeader = '%PDF-1.4\n%header\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === 'content-length') return '10485760';
            if (header.toLowerCase() === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      const result = await preflightPdfSignedUrl('https://storage.example.com/menu.pdf', mockFetch as any);

      expect(result.isValidPdf).toBe(true);
      expect(result.headerSnippet).toBe('%PDF-1.4');
      expect(result.detectedSizeBytes).toBe(10485760);
    });

    it('7. rejeita com HttpError 422 se o cabeçalho não iniciar com %PDF-', async () => {
      const fakeHtmlHeader = '<!DOCTYPE html><html><head><title>Error</title></head>';
      const fakeBuffer = Buffer.from(fakeHtmlHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: {
          get: () => 'text/html',
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      await expect(
        preflightPdfSignedUrl('https://storage.example.com/error.html', mockFetch as any)
      ).rejects.toThrow(HttpError);
    });

    it('8. rejeita com HttpError 413 se o tamanho informado pelo header for maior que 20 MiB', async () => {
      const fakePdfHeader = '%PDF-1.5\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');
      const largeSizeBytes = 25 * 1024 * 1024; // 25 MiB

      const mockFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-range' ? `bytes 0-1023/${largeSizeBytes}` : null),
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      await expect(
        preflightPdfSignedUrl('https://storage.example.com/large.pdf', mockFetch as any)
      ).rejects.toThrow(HttpError);
    });
  });

  describe('6. Integração com Gemini Interactions API — Pipeline DOMAIN_NATIVE', () => {
    it('26. para PDF: executa exatamente 1 chamada com thinking MEDIUM, Signed URL e schema Domain-Native', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 2500, candidates_tokens: 1800, total_tokens: 4300 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const fakePdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf-8');
      const mockPreflightFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: { get: () => 'bytes 0-1023/1048576' },
        arrayBuffer: async () => toArrayBuffer(fakePdfBuffer),
      });

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'pdf',
        tenantId: 'test-tenant',
        signedUrl: 'https://storage.supabase.co/catalog-import-temp/tenant/cardapio.pdf?token=secret123',
        aiClient: mockAi as any,
        fetchClient: mockPreflightFetch as any,
      });

      // 1 única chamada ao modelo
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('signed_url');
      expect(result.thinkingLevel).toBe('medium');
      expect(result.success).toBe(true);
      expect(result).not.toHaveProperty('rawJson');

      // Validação detalhada do payload enviado para ai.interactions.create
      const payload = mockCreateInteraction.mock.calls[0][0];
      expect(payload.model).toBe('gemini-2.5-flash');
      expect(payload.system_instruction).toBe(DOMAIN_NATIVE_SYSTEM_INSTRUCTION);

      // Transport do PDF: Signed URL como documento
      expect(payload.input[0]).toEqual({
        type: 'document',
        uri: 'https://storage.supabase.co/catalog-import-temp/tenant/cardapio.pdf?token=secret123',
        mime_type: 'application/pdf',
      });
      expect(payload.input[1].type).toBe('text');

      // Structured Output preservado
      expect(payload.response_format).toEqual({
        type: 'text',
        mime_type: 'application/json',
        schema: domainNativeJsonSchema,
      });

      // Thinking MEDIUM explicitamente configurado em generation_config
      expect(payload.generation_config).toEqual({
        max_output_tokens: 16384,
        thinking_level: 'medium',
        seed: DOMAIN_NATIVE_GENERATION_SEED,
      });
    });

    it('27. para Imagem: executa exatamente 1 chamada com imagem inline base64 e thinking MEDIUM', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 1500, candidates_tokens: 1200, total_tokens: 2700 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'image',
        tenantId: 'test-tenant',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        imageMimeType: 'image/png',
        aiClient: mockAi as any,
      });

      // 1 única chamada ao modelo
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('inline');
      expect(result.thinkingLevel).toBe('medium');
      expect(result.seed).toBe(DOMAIN_NATIVE_GENERATION_SEED);

      // Payload da imagem inline
      const payload = mockCreateInteraction.mock.calls[0][0];
      expect(payload.input[0]).toEqual({
        type: 'image',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        mime_type: 'image/png',
      });
      expect(payload.input[1].type).toBe('text');

      // Structured Output e thinking MEDIUM
      expect(payload.response_format.type).toBe('text');
      expect(payload.response_format.mime_type).toBe('application/json');
      expect(payload.response_format.schema).toBe(domainNativeJsonSchema);
      expect(payload.generation_config.thinking_level).toBe('medium');
      expect(payload.generation_config.seed).toBe(DOMAIN_NATIVE_GENERATION_SEED);
    });
  });
});
