import { HttpError } from '../middleware/errors.js';

export type PostalCodeScope = 'street' | 'district' | 'city';

export type PostalCodeAddress = {
  postalCode: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  scope: PostalCodeScope;
};

function scopeOf(address: Pick<PostalCodeAddress, 'street' | 'district'>): PostalCodeScope {
  if (address.street) return 'street';
  if (address.district) return 'district';
  return 'city';
}

export async function lookupPostalCode(value: string): Promise<PostalCodeAddress> {
  const postalCode = value.replace(/\D/g, '');
  if (!/^\d{8}$/.test(postalCode)) throw new HttpError(400, 'CEP inválido.', 'INVALID_POSTAL_CODE');

  const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) throw new HttpError(502, 'Não foi possível consultar o CEP.', 'POSTAL_CODE_PROVIDER_ERROR');
  const data = await response.json() as Record<string, unknown>;
  if (data.erro) throw new HttpError(404, 'CEP não encontrado.', 'POSTAL_CODE_NOT_FOUND');

  const address = {
    postalCode: String(data.cep || postalCode),
    street: String(data.logradouro || '').trim(),
    complement: String(data.complemento || '').trim(),
    district: String(data.bairro || '').trim(),
    city: String(data.localidade || '').trim(),
    state: String(data.uf || '').trim().toUpperCase(),
  };
  return { ...address, scope: scopeOf(address) };
}

