import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, MapPin, Search, Trash2, X, Plus } from 'lucide-react';
import { customerApi } from '../features/customer/api';
import {
  getLocalAddresses,
  getLastAddress,
  saveLastAddress,
  removeLocalAddress,
  formatFullAddress,
  type SavedCustomerAddress,
} from '../lib/customerStorage';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelivery: (address: any) => void;
  user: any;
  tenantSlug?: string | null;
  canSaveAddress?: boolean;
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

export default function DeliveryAddressModal({
  isOpen,
  onClose,
  onConfirmDelivery,
  user,
  tenantSlug,
  canSaveAddress = false,
}: Props) {
  const [mode, setMode] = useState<'choose' | 'form'>('choose');
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveAddress, setSaveAddress] = useState(false);
  const [localAddresses, setLocalAddresses] = useState<SavedCustomerAddress[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, tenantSlug, user]);

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

  const searchCep = async () => {
    const cleanCep = form.cep.replace(/\D/g, '');
    if (!tenantSlug || cleanCep.length !== 8) {
      return setError('Informe um CEP válido com 8 números.');
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/cep/${cleanCep}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'CEP não encontrado.');
      setForm((value) => ({ ...value, ...data.address, cep: data.address.cep || cleanCep }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o CEP.');
    } finally {
      setLoading(false);
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

  const handleDeleteLocal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeLocalAddress(tenantSlug, id);
    const updated = getLocalAddresses(tenantSlug);
    setLocalAddresses(updated);
    if (updated.length === 0 && (!user?.enderecos || user.enderecos.length === 0)) {
      setMode('form');
    }
  };

  const userAddresses = user?.enderecos || [];
  const displayAddresses =
    userAddresses.length > 0
      ? userAddresses
      : localAddresses;

  const field =
    'h-11 w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-[var(--store-primary,#059669)] focus:bg-white focus:ring-1 focus:ring-[var(--store-primary,#059669)]';

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-800">Endereço de entrega</h2>
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
                    onClick={() => select(address)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-gray-50/80 active:bg-gray-100"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full store-bg-soft store-text-primary">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {address.titulo || 'Endereço salvo'}
                          </p>
                          {address.padrao && (
                            <span className="rounded-full store-bg-soft px-2 py-0.5 text-[10px] font-semibold store-text-primary">
                              Padrão
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-gray-600 mt-0.5">
                          {address.logradouro || address.rua}, {address.numero}
                          {address.complemento ? ` (${address.complemento})` : ''}
                        </p>
                        <p className="truncate text-[11px] text-gray-500">
                          {address.bairro} · {address.cidade}/{address.estado}
                        </p>
                      </div>
                    </div>

                    {!userAddresses.length && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteLocal(e, address.id)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
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
                <label className="text-xs font-medium text-gray-700">CEP</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.cep}
                    onChange={(event) =>
                      setForm({ ...form, cep: event.target.value.replace(/\D/g, '').slice(0, 8) })
                    }
                    className={field}
                    inputMode="numeric"
                    placeholder="00000-000"
                  />
                  <button
                    type="button"
                    onClick={searchCep}
                    disabled={loading}
                    className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl store-bg-primary store-text-on-primary shadow-sm hover:opacity-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-gray-700">
                Rua / Logradouro
                <input
                  value={form.logradouro}
                  onChange={(event) => setForm({ ...form, logradouro: event.target.value })}
                  className={`${field} mt-1`}
                  placeholder="Ex: Av. Paulista"
                />
              </label>

              <div className="grid grid-cols-[110px_1fr] gap-3">
                <label className="block text-xs font-medium text-gray-700">
                  Número
                  <input
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

              <label className="block text-xs font-medium text-gray-700">
                Bairro
                <input
                  value={form.bairro}
                  onChange={(event) => setForm({ ...form, bairro: event.target.value })}
                  className={`${field} mt-1`}
                  placeholder="Ex: Centro"
                />
              </label>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <label className="block text-xs font-medium text-gray-700">
                  Cidade
                  <input
                    value={form.cidade}
                    onChange={(event) => setForm({ ...form, cidade: event.target.value })}
                    className={`${field} mt-1`}
                    placeholder="Ex: São Paulo"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  UF
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
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
