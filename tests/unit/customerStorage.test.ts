import { describe, expect, it } from 'vitest';
import { accountAddressIdForCheckout } from '../../src/lib/customerStorage';

describe('accountAddressIdForCheckout', () => {
  const accountId = '507f1f77bcf86cd799439011';

  it('uses an id only when the address belongs to the current account', () => {
    expect(accountAddressIdForCheckout({ id: accountId }, [{ id: accountId }])).toBe(accountId);
  });

  it('does not confuse a local or another account address with the current account', () => {
    expect(accountAddressIdForCheckout({ id: crypto.randomUUID() }, [{ id: accountId }])).toBeUndefined();
    expect(accountAddressIdForCheckout({ id: '507f1f77bcf86cd799439099' }, [{ id: accountId }])).toBeUndefined();
  });
});
