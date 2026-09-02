export interface SavedCustomerAddress {
  id: string;
  titulo: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  referencia?: string;
  bairro: string;
  cidade: string;
  estado: string;
  padrao?: boolean;
  latitude?: number;
  longitude?: number;
  locationConfirmed?: boolean;
  locationConfirmationToken?: string;
  enderecoCompleto: string;
  updatedAt?: number;
}

export interface SavedCustomerProfile {
  nome?: string;
  telefone?: string;
  email?: string;
}

export const formatFullAddress = (addr: Partial<SavedCustomerAddress>) => {
  const streetPart = `${addr.logradouro || ''}, ${addr.numero || ''}`.trim().replace(/^,\s*/, '');
  const compPart = addr.complemento ? ` (${addr.complemento})` : '';
  const neighborhoodPart = addr.bairro ? ` - ${addr.bairro}` : '';
  const cityStatePart = addr.cidade ? `, ${addr.cidade}${addr.estado ? `/${addr.estado}` : ''}` : '';
  return `${streetPart}${compPart}${neighborhoodPart}${cityStatePart}`.trim();
};

export const getLocalAddresses = (tenantSlug?: string | null): SavedCustomerAddress[] => {
  if (typeof window === 'undefined') return [];
  const key = `podevir_customer_addresses_${tenantSlug || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getLastAddress = (tenantSlug?: string | null): SavedCustomerAddress | null => {
  if (typeof window === 'undefined') return null;
  const key = `podevir_customer_last_address_${tenantSlug || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const all = getLocalAddresses(tenantSlug);
      return all.length > 0 ? all[0] : null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveLastAddress = (tenantSlug: string | null | undefined, address: any): SavedCustomerAddress => {
  if (typeof window === 'undefined') return address;
  const id = address.id || address._id || globalThis.crypto?.randomUUID?.() || String(Date.now());
  const formatted: SavedCustomerAddress = {
    id: String(id),
    titulo: address.titulo || 'Meu Endereço',
    cep: String(address.cep || '').replace(/\D/g, ''),
    logradouro: String(address.logradouro || address.rua || ''),
    numero: String(address.numero || ''),
    complemento: String(address.complemento || ''),
    referencia: String(address.referencia || ''),
    bairro: String(address.bairro || ''),
    cidade: String(address.cidade || ''),
    estado: String(address.estado || address.uf || ''),
    padrao: Boolean(address.padrao),
    latitude: Number.isFinite(address.latitude) ? Number(address.latitude) : undefined,
    longitude: Number.isFinite(address.longitude) ? Number(address.longitude) : undefined,
    locationConfirmed: Boolean(address.locationConfirmed),
    locationConfirmationToken: address.locationConfirmationToken ? String(address.locationConfirmationToken) : undefined,
    enderecoCompleto: address.enderecoCompleto || formatFullAddress(address),
    updatedAt: Date.now(),
  };

  try {
    // 1. Salva como último endereço usado
    const lastKey = `podevir_customer_last_address_${tenantSlug || 'global'}`;
    localStorage.setItem(lastKey, JSON.stringify(formatted));

    // 2. Salva ou atualiza na lista de endereços locais
    const listKey = `podevir_customer_addresses_${tenantSlug || 'global'}`;
    const currentList = getLocalAddresses(tenantSlug);
    const filtered = currentList.filter(
      (a) =>
        a.id !== formatted.id &&
        !(
          a.cep === formatted.cep &&
          a.numero === formatted.numero &&
          a.logradouro.toLowerCase() === formatted.logradouro.toLowerCase()
        )
    );
    const updatedList = [formatted, ...filtered].slice(0, 10);
    localStorage.setItem(listKey, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Erro ao salvar endereço no localStorage:', e);
  }

  return formatted;
};

export const removeLocalAddress = (tenantSlug: string | null | undefined, addressId: string) => {
  if (typeof window === 'undefined') return;
  try {
    const listKey = `podevir_customer_addresses_${tenantSlug || 'global'}`;
    const currentList = getLocalAddresses(tenantSlug);
    const updatedList = currentList.filter((a) => a.id !== addressId);
    localStorage.setItem(listKey, JSON.stringify(updatedList));

    const last = getLastAddress(tenantSlug);
    if (last && last.id === addressId) {
      const lastKey = `podevir_customer_last_address_${tenantSlug || 'global'}`;
      if (updatedList.length > 0) {
        localStorage.setItem(lastKey, JSON.stringify(updatedList[0]));
      } else {
        localStorage.removeItem(lastKey);
      }
    }
  } catch (e) {
    console.warn('Erro ao remover endereço do localStorage:', e);
  }
};

export const getCustomerProfile = (tenantSlug?: string | null): SavedCustomerProfile | null => {
  if (typeof window === 'undefined') return null;
  const key = `podevir_customer_profile_${tenantSlug || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveCustomerProfile = (tenantSlug: string | null | undefined, profile: SavedCustomerProfile) => {
  if (typeof window === 'undefined') return;
  const key = `podevir_customer_profile_${tenantSlug || 'global'}`;
  try {
    const current = getCustomerProfile(tenantSlug) || {};
    localStorage.setItem(key, JSON.stringify({ ...current, ...profile }));
  } catch (e) {
    console.warn('Erro ao salvar perfil no localStorage:', e);
  }
};
