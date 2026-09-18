import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, MapPin, Search, Trash2, X, Plus } from 'lucide-react';
import { customerApi } from '../features/customer/api';
import {
  getLocalAddresses,
  getLastAddress,
  saveLastAddress,
  removeLocalAddress,
  type SavedCustomerAddress,
} from '../lib/customerStorage';
import type { StoreSettings } from '../types/storefront';
import { extractHouseNumber } from '../lib/addressSearch';
import { useDialogFocus } from '../hooks/useDialogFocus';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelivery: (address: any) => void;
  user: any;
  tenantSlug?: string | null;
  canSaveAddress?: boolean;
  storeSettings?: StoreSettings | null;
};

const empty = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  referencia: '',
  bairro: '',
  cidade: '',
  estado: '',
};

type AddressSuggestion = {
  label: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
};

export default function DeliveryAddressModal({
  isOpen,
  onClose,
  onConfirmDelivery,
  user,
  tenantSlug,
  canSaveAddress = false,
  storeSettings,
}: Props) {
  const [mode, setMode] = useState<'choose' | 'form'>('choose');
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cepFeedback, setCepFeedback] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchFeedback, setAddressSearchFeedback] = useState('');
  const cepRequestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cepInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [localAddresses, setLocalAddresses] = useState<SavedCustomerAddress[]>([]);

  useDialogFocus(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (!isOpen) return;

    // Carrega endereços salvos localmente
    const savedLocal = getLocalAddresses(tenantSlug);
    setLocalAddresses(savedLocal);

    const userAddrs = user?.enderecos || [];
    const totalAddrs = userAddrs.length + savedLocal.length;

    if (totalAddrs > 0) {
      setMode('choose');
    } else {
      // Se não há nenhum endereço salvo, abre direto no formulário com prefill se houver
      const last = getLastAddress(tenantSlug);
      if (last) {
        setForm({
          cep: last.cep || '',
          logradouro: last.logradouro || '',
          numero: last.numero || '',
          complemento: last.complemento || '',
          referencia: last.referencia || '',
          bairro: last.bairro || '',
          cidade: last.cidade || '',
          estado: last.estado || '',
        });
      } else {
        setForm(empty);
      }
      setMode('form');
    }

    setError('');
    setAddressQuery('');
    setSuggestions([]);
    setSearchingAddress(false);
    setAddressSearchFeedback('');
  }, [isOpen, tenantSlug, user]);

  useEffect(() => {
    if (!isOpen) return;
    const query = addressQuery.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearchingAddress(false);
      setAddressSearchFeedback('');
      return;
    }
    if (!tenantSlug) {
      setSuggestions([]);
      setSearchingAddress(false);
      setAddressSearchFeedback('Busca indisponível. Preencha o endereço manualmente.');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingAddress(true);
      setAddressSearchFeedback('');
      try {
        const params = new URLSearchParams({ q: query });
        const storeCity = String(storeSettings?.cidade_loja || '').trim();
        const storeState = String(storeSettings?.estado_loja || '').trim().slice(0, 2);
        if (storeCity) params.set('city', storeCity);
        if (storeState) params.set('state', storeState);
        const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/address-search?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error('address-search-failed');
        const nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(nextSuggestions);
        setAddressSearchFeedback(nextSuggestions.length === 0
          ? 'Nenhum endereço encontrado. Tente incluir cidade/UF ou preencha manualmente.'
          : '');
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setAddressSearchFeedback('Não foi possível buscar agora. Preencha o endereço manualmente.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchingAddress(false);
      }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [isOpen, addressQuery, tenantSlug, storeSettings?.cidade_loja, storeSettings?.estado_loja]);

  if (!isOpen) return null;

  const select = (address: any) => {
    const formatted = saveLastAddress(tenantSlug, address);
    onConfirmDelivery({
      ...formatted,
      enderecoCompleto:
        formatted.enderecoCompleto ||
        `${formatted.logradouro}, ${formatted.numero} - ${formatted.bairro}, ${formatted.cidade}/${formatted.estado}`,
    });
    onClose();
  };

  const searchCep = async (postalCode = form.cep) => {
    const cleanCep = postalCode.replace(/\D/g, '');
    if (!tenantSlug || cleanCep.length !== 8) {
      return setError('Informe um CEP válido com 8 números.');
    }
    const requestId = ++cepRequestRef.current;
    setLoading(true);
    setError('');
    setCepFeedback('Buscando endereço...');
    try {
      const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/cep/${cleanCep}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'CEP não encontrado.');
      if (requestId !== cepRequestRef.current) return;
      const found = data.address || {};
      setForm((value) => ({
        ...value,
        cep: found.cep || cleanCep,
        logradouro: found.logradouro || value.logradouro,
        complemento: found.complemento || value.complemento,
        bairro: found.bairro || value.bairro,
        cidade: found.cidade || value.cidade,
        estado: found.estado || value.estado,
      }));
      setCepFeedback(found.scope === 'street'
        ? 'Endereço encontrado. Agora informe somente o número.'
        : found.scope === 'district'
          ? `Este CEP abrange o bairro ${found.bairro}. Digite a rua e o número.`
          : `Este é um CEP geral de ${found.cidade}/${found.estado}. Digite rua, bairro e número.`);
    } catch (caught) {
      if (requestId !== cepRequestRef.current) return;
      setCepFeedback('');
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o CEP.');
    } finally {
      if (requestId === cepRequestRef.current) setLoading(false);
    }
  };

  const confirm = async () => {
    if (
      !form.logradouro ||
      !form.numero ||
      !form.bairro ||
      !form.cidade ||
      !form.estado ||
      form.cep.replace(/\D/g, '').length !== 8
    ) {
      return setError('Preencha os campos obrigatórios do endereço (CEP, Rua, Número, Bairro e Cidade).');
    }
    setLoading(true);
    setError('');
    try {
      let address: any = {
        ...form,
        titulo: 'Endereço de entrega',
        cep: form.cep.replace(/\D/g, ''),
        enderecoCompleto: `${form.logradouro}, ${form.numero}${form.complemento ? ` - ${form.complemento}` : ''} - ${form.bairro}, ${form.cidade}/${form.estado}`,
      };

      if (saveAddress && canSaveAddress && user && tenantSlug) {
        try {
          const saved = await customerApi(tenantSlug).createAddress({
            ...address,
            padrao: !(user.enderecos || []).length,
          });
          address = saved.user.enderecos[saved.user.enderecos.length - 1] || address;
        } catch {
          // Continua localmente mesmo se falhar no backend
        }
      }

      select(address);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o endereço.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLocal = (id: string) => {
    removeLocalAddress(tenantSlug, id);
    const updated = getLocalAddresses(tenantSlug);
    setLocalAddresses(updated);
    if (updated.length === 0 && (!user?.enderecos || user.enderecos.length === 0)) {
      setMode('form');
    }
  };

  const userAddresses = user?.enderecos || [];
  const accountIds = new Set(userAddresses.map((address: any) => String(address.id || address._id || '')));
  const displayAddresses = [
    ...userAddresses,
    ...localAddresses.filter((local) => !accountIds.has(String(local.id || '')) && !userAddresses.some((account: any) =>
      String(account.cep || '').replace(/\D/g, '') === String(local.cep || '').replace(/\D/g, '')
      && String(account.numero || '').trim() === String(local.numero || '').trim()
      && String(account.logradouro || '').trim().toLowerCase() === String(local.logradouro || '').trim().toLowerCase())),
  ];

  const field =
    'h-11 w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-[var(--store-primary,#059669)] focus:bg-white focus:ring-1 focus:ring-[var(--store-primary,#059669)]';

  return ReactDOM.createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-address-title"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h2 id="delivery-address-title" className="font-bold text-gray-800">Endereço de entrega</h2>
            <p className="text-xs text-gray-500">Onde você deseja receber o pedido?</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {mode === 'choose' ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-gray-200 divide-y divide-gray-100">
                {displayAddresses.map((address: any) => (
                  <div
                    key={address.id || address._id}
                    className="flex w-full items-center justify-between gap-1 transition-colors hover:bg-gray-50/80 active:bg-gray-100"
                  >
                    <button
                      type="button"
                      onClick={() => select(address)}
                      className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full store-bg-soft store-text-primary">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-800">
                            {address.titulo || 'Endereço salvo'}
                          </span>
                          {address.padrao && (
                            <span className="rounded-full store-bg-soft px-2 py-0.5 text-[10px] font-semibold store-text-primary">
                              Padrão
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-600">
                          {address.logradouro || address.rua}, {address.numero}
                          {address.complemento ? ` (${address.complemento})` : ''}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500">
                          {address.bairro} · {address.cidade}/{address.estado}
                        </span>
                      </span>
                    </button>

                    {!accountIds.has(String(address.id || address._id || '')) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteLocal(address.id)}
                        className="mr-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label="Remover endereço salvo deste dispositivo"
                        title="Remover endereço"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setForm(empty);
                  setMode('form');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3.5 text-sm font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Plus className="h-4 w-4 store-text-primary" /> Inserir outro endereço
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {displayAddresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('choose')}
                  className="text-xs font-semibold store-text-primary hover:underline flex items-center gap-1"
                >
                  ← Voltar aos endereços salvos
                </button>
              )}

              <div>
                <label htmlFor="delivery-address-search" className="text-xs font-medium text-gray-700">Buscar endereço e número</label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                  <input
                    id="delivery-address-search"
                    data-dialog-autofocus={mode === 'form' ? true : undefined}
                    value={addressQuery}
                    onChange={(event) => { setAddressQuery(event.target.value); setAddressSearchFeedback(''); setError(''); }}
                    className={`${field} pl-9`}
                    placeholder="Ex: Rua da Torre, 237, Resende"
                    autoComplete="street-address"
                    aria-describedby={addressSearchFeedback ? 'delivery-address-search-feedback' : undefined}
                  />
                </div>
                {(searchingAddress || suggestions.length > 0) && <div className="mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  {searchingAddress && <p className="px-3 py-2 text-xs text-gray-500">Buscando endereços...</p>}
                  {suggestions.map((suggestion) => <button
                    key={`${suggestion.logradouro}-${suggestion.numero}-${suggestion.cidade}-${suggestion.estado}`}
                    type="button"
                    onClick={() => {
                      const queryNumber = extractHouseNumber(addressQuery);
                      const nextNumber = suggestion.numero || queryNumber;
                      setForm((value) => ({
                        ...value,
                        cep: suggestion.cep || value.cep,
                        logradouro: suggestion.logradouro,
                        numero: nextNumber || value.numero,
                        bairro: suggestion.bairro || value.bairro,
                        cidade: suggestion.cidade,
                        estado: suggestion.estado,
                      }));
                      setAddressQuery('');
                      setSuggestions([]);
                      setError('');
                      const missingNumber = !nextNumber;
                      const missingCep = !suggestion.cep;
                      setCepFeedback(missingNumber
                        ? 'Endereço encontrado. Agora informe o número.'
                        : missingCep
                          ? 'Endereço encontrado. Complete o CEP e confira os dados abaixo.'
                          : 'Endereço e número preenchidos. Confira os dados abaixo.');
                      window.setTimeout(() => {
                        if (missingNumber) numberInputRef.current?.focus();
                        else if (missingCep) cepInputRef.current?.focus();
                      }, 0);
                    }}
                    className="block w-full border-t border-gray-100 px-3 py-2.5 text-left text-xs text-gray-700 first:border-t-0 hover:bg-gray-50"
                  >{suggestion.label}</button>)}
                </div>}
                {addressSearchFeedback && (
                  <p id="delivery-address-search-feedback" className="mt-1.5 text-xs text-gray-500" role="status">
                    {addressSearchFeedback}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><span className="h-px flex-1 bg-gray-200" /><span>ou preencha manualmente</span><span className="h-px flex-1 bg-gray-200" /></div>
              </div>

              <div>
                <label htmlFor="delivery-address-cep" className="text-xs font-medium text-gray-700">CEP *</label>
                <div className="mt-1 flex gap-2">
                  <input
                    ref={cepInputRef}
                    id="delivery-address-cep"
                    value={form.cep}
                    onChange={(event) => {
                      const cep = event.target.value.replace(/\D/g, '').slice(0, 8);
                      setForm({ ...form, cep });
                      setCepFeedback('');
                      setError('');
                      if (cep.length === 8) void searchCep(cep);
                    }}
                    className={field}
                    inputMode="numeric"
                    placeholder="00000-000"
                  />
                  <button
                    type="button"
                    onClick={() => void searchCep()}
                    disabled={loading}
                    aria-label={loading ? 'Buscando CEP' : 'Buscar CEP'}
                    className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl store-bg-primary store-text-on-primary shadow-sm hover:opacity-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
                {cepFeedback && <p aria-live="polite" className="mt-2 text-xs font-medium text-gray-600">{cepFeedback}</p>}
              </div>

                <label className="block text-xs font-medium text-gray-700">
                  Rua / Logradouro *
                <input
                  value={form.logradouro}
                  onChange={(event) => { setForm({ ...form, logradouro: event.target.value }); setError(''); }}
                  className={`${field} mt-1`}
                  placeholder="Ex: Av. Paulista"
                />
              </label>

              <div className="grid grid-cols-[110px_1fr] gap-3">
                <label className="block text-xs font-medium text-gray-700">
                  Número *
                  <input
                    ref={numberInputRef}
                    value={form.numero}
                    onChange={(event) => setForm({ ...form, numero: event.target.value })}
                    className={`${field} mt-1`}
                    placeholder="123"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  Complemento
                  <input
                    value={form.complemento}
                    onChange={(event) => setForm({ ...form, complemento: event.target.value })}
                    className={`${field} mt-1`}
                    placeholder="Apto 42, Bloco B"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-gray-700">
                Ponto de referência
                <input
                  value={form.referencia}
                  onChange={(event) => setForm({ ...form, referencia: event.target.value })}
                  className={`${field} mt-1`}
                  placeholder="Ex: Próximo à padaria, portão azul"
                />
              </label>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Bairro *
                  <input
                    value={form.bairro}
                    onChange={(event) => setForm({ ...form, bairro: event.target.value })}
                    className={`${field} mt-1`}
                    placeholder="Ex: Centro"
                    list="store-neighborhoods-list"
                  />
                </label>
                {['bairro', 'bairro_regiao'].includes(storeSettings?.tipo_taxa_entrega || 'bairro_regiao') && storeSettings?.taxas_bairros && storeSettings.taxas_bairros.length > 0 && (
                  <datalist id="store-neighborhoods-list">
                    {storeSettings.taxas_bairros
                      .filter((b) => b.ativo !== false)
                      .map((b) => (
                        <option
                          key={b._id || b.id || b.nome}
                          value={b.nome}
                        >
                          {b.nome} {b.valor > 0 ? `(Frete: R$ ${Number(b.valor).toFixed(2).replace('.', ',')})` : '(Frete Grátis)'}
                        </option>
                      ))}
                  </datalist>
                )}
                {['bairro', 'bairro_regiao'].includes(storeSettings?.tipo_taxa_entrega || 'bairro_regiao') && storeSettings?.taxas_bairros && storeSettings.taxas_bairros.length > 0 && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    💡 Digite ou selecione seu bairro na lista de bairros atendidos.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <label className="block text-xs font-medium text-gray-700">
                  Cidade *
                  <input
                    value={form.cidade}
                    onChange={(event) => setForm({ ...form, cidade: event.target.value })}
                    className={`${field} mt-1`}
                    placeholder="Ex: São Paulo"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  UF *
                  <input
                    value={form.estado}
                    onChange={(event) =>
                      setForm({ ...form, estado: event.target.value.toUpperCase().slice(0, 2) })
                    }
                    className={`${field} mt-1`}
                    placeholder="SP"
                  />
                </label>
              </div>

              {user && canSaveAddress && (
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(event) => setSaveAddress(event.target.checked)}
                    className="h-4 w-4 rounded text-[var(--store-primary,#059669)] focus:ring-[var(--store-primary,#059669)]"
                  />
                  Salvar este endereço também na minha conta
                </label>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={confirm}
                disabled={loading}
                className="h-12 w-full rounded-xl store-bg-primary store-text-on-primary text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-60 transition-opacity"
              >
                {loading ? 'Salvando...' : 'Confirmar este endereço'}
              </button>
              <p className="text-center text-[10px] text-gray-400">
                <a href="https://locationiq.com" target="_blank" rel="noreferrer" className="font-semibold underline hover:text-gray-600">Search by LocationIQ.com</a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
