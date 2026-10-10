import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '@vercel/analytics';
import { trackLandingAction } from '../../src/components/landing/landingAnalytics';
import { getPlatformOrigin } from '../../src/components/landing/landingContent';

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('aquisição institucional', () => {
  it('registra posição e somente campanhas permitidas, sem copiar dados livres da URL', () => {
    vi.stubGlobal('window', { location: { search: '?utm_source=instagram&utm_medium=social&utm_campaign=encomendas&email=private@example.com&token=private' } });
    trackLandingAction('contact', 'hero');
    expect(track).toHaveBeenCalledExactlyOnceWith('landing_action', { action: 'contact', position: 'hero', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'encomendas' });
  });
  it('descarta rótulos de campanha livres e continua quando a medição falha', () => {
    vi.stubGlobal('window', { location: { search: '?utm_source=private@example.com&utm_campaign=private' } });
    vi.mocked(track).mockImplementationOnce(() => { throw new Error('blocked'); });
    expect(() => trackLandingAction('example', 'footer')).not.toThrow();
    expect(track).toHaveBeenCalledWith('landing_action', { action: 'example', position: 'footer' });
  });
});

describe('origem canônica institucional', () => {
  it('aceita somente uma origem HTTPS sem credenciais ou caminho', () => {
    expect(getPlatformOrigin('https://platform.example')).toBe('https://platform.example');
    for (const value of [undefined, 'not-a-url', 'http://platform.example', 'https://user:secret@platform.example', 'https://platform.example/store', 'https://platform.example?token=private']) expect(getPlatformOrigin(value)).toBeNull();
  });
});
