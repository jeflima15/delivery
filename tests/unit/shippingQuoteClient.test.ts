import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocationConfirmationRequiredError, requestShippingQuote, shippingEstimateLabel,
  shippingQuoteNeedsConfirmation, ShippingQuoteRequestGuard, type ShippingQuoteResult,
} from '../../src/lib/shippingQuote';

const quote: ShippingQuoteResult = {
  id: 'quote-1', feeCents: 500, deliveryTimeMin: 30, deliveryTimeMax: 45,
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const address = { logradouro: 'Rua A', numero: '10', cidade: 'Cidade' };

afterEach(() => vi.unstubAllGlobals());

describe('shipping estimates and renewal', () => {
  it('formats range, single, zero and absent estimates', () => {
    expect(shippingEstimateLabel(quote)).toBe('30-45 min');
    expect(shippingEstimateLabel({ deliveryTimeMin: 30, deliveryTimeMax: 30 })).toBe('30 min');
    expect(shippingEstimateLabel({ deliveryTimeMin: 0 })).toBe('0 min');
    expect(shippingEstimateLabel(null)).toBe('');
  });

  it('does not require confirmation for an unchanged summary with a new id', () => {
    expect(shippingQuoteNeedsConfirmation(quote, { ...quote, id: 'quote-2' }, 500, 500)).toBe(false);
  });

  it.each([0, 400, 600])('requires confirmation when effective fee changes to %s', (fee) => {
    expect(shippingQuoteNeedsConfirmation(quote, quote, 500, fee)).toBe(true);
  });

  it('compares effective fees, not raw fees under free shipping', () => {
    expect(shippingQuoteNeedsConfirmation(quote, { ...quote, feeCents: 900 }, 0, 0)).toBe(false);
  });

  it.each([
    { deliveryTimeMin: 31 }, { deliveryTimeMax: 46 },
    { deliveryTimeMin: undefined, deliveryTimeMax: undefined },
  ])('requires confirmation for a changed estimate even with free shipping', (change) => {
    expect(shippingQuoteNeedsConfirmation(quote, { ...quote, ...change }, 0, 0)).toBe(true);
  });

  it('requires confirmation when no previous quote exists', () => {
    expect(shippingQuoteNeedsConfirmation(null, quote, 500, 500)).toBe(true);
  });
});

describe('shipping request lifecycle', () => {
  it('invalidates previous requests when a new address is quoted', () => {
    const guard = new ShippingQuoteRequestGuard();
    const previous = guard.start();
    const next = guard.start();
    expect(previous.aborted).toBe(true);
    expect(guard.isCurrent(previous)).toBe(false);
    expect(guard.isCurrent(next)).toBe(true);
  });

  it('invalidates requests on close or modality change and can restart', () => {
    const guard = new ShippingQuoteRequestGuard();
    const pending = guard.start();
    guard.cancel();
    guard.cancel();
    expect(guard.isCurrent(pending)).toBe(false);
    expect(pending.aborted).toBe(true);
    expect(guard.isCurrent(guard.start())).toBe(true);
  });

  it('rejects late successes even when transport ignores cancellation', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const guard = new ShippingQuoteRequestGuard();
    const signal = guard.start();
    const pending = requestShippingQuote('loja', address, signal);
    guard.cancel();
    resolveResponse(Response.json({ success: true, quote }));
    await pending;
    expect(guard.isCurrent(signal)).toBe(false);
  });

  it('passes cancellation and location confirmation to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, quote }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await requestShippingQuote('loja/a', {
      ...address, latitude: 0, longitude: 0, locationConfirmed: true, locationConfirmationToken: 'token',
    }, signal)).toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith('/api/customer/stores/loja%2Fa/shipping/quote', expect.objectContaining({
      signal, method: 'POST', credentials: 'include',
      body: expect.stringContaining('"locationConfirmationToken":"token"'),
    }));
  });

  it('rejects stale errors without invalidating the newer request', async () => {
    let rejectResponse!: (reason: Error) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectResponse = reject; })));
    const guard = new ShippingQuoteRequestGuard();
    const oldSignal = guard.start();
    const pending = requestShippingQuote('loja', address, oldSignal);
    const newSignal = guard.start();
    rejectResponse(new Error('Old request failed'));
    await expect(pending).rejects.toThrow('Old request failed');
    expect(guard.isCurrent(oldSignal)).toBe(false);
    expect(guard.isCurrent(newSignal)).toBe(true);
  });

  it('preserves the map confirmation flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false, error: {
      code: 'LOCATION_CONFIRMATION_REQUIRED', details: {
        location: { latitude: 1, longitude: 2 }, confirmationToken: 'token',
      },
    } }, { status: 422 })));
    await expect(requestShippingQuote('loja', address)).rejects.toBeInstanceOf(LocationConfirmationRequiredError);
  });

  it('propagates shipping errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: false, error: { message: 'Fora da area' },
    }, { status: 422 })));
    await expect(requestShippingQuote('loja', address)).rejects.toThrow('Fora da area');
  });
});
