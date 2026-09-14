import { useEffect, useRef, useState } from 'react';
import { useTenantAdminApi } from './TenantAdminContext';

export function useAdminManifest(slug: string) {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'manifest'; link.href = `/api/public/stores/${encodeURIComponent(slug)}/admin.webmanifest`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [slug]);
}

function subscriptionHash(subscription: PushSubscription) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint)).then((buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(''));
}
const button = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50';

export default function PushSettings() {
  const api = useTenantAdminApi();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getPushSettings>> | null>(null);
  const [currentHash, setCurrentHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [name, setName] = useState('Meu aparelho');
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const needsInstall = ios && !installed;
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const reload = async () => {
    setData(await api.getPushSettings());
    if (supported) {
      const sw = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
      registration.current = sw;
      const subscription = await sw.pushManager.getSubscription();
      setCurrentHash(subscription ? await subscriptionHash(subscription) : '');
      setPermission(Notification.permission);
    }
  };
  useEffect(() => { void reload().catch(() => setError('Não foi possível carregar os avisos. Tente novamente.')); }, [api]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await reload(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível configurar os avisos.'); }
    finally { setBusy(false); }
  };
  const activate = () => {
    // Permission must be requested directly from the user's click, notably on iOS.
    const permissionRequest = Notification.requestPermission();
    void run(async () => {
      const result = await permissionRequest; setPermission(result);
      if (result !== 'granted') throw new Error('Os avisos não foram autorizados. Você pode permitir nas configurações do navegador ou do aparelho.');
      const sw = registration.current;
      if (!sw || !data?.publicKey) throw new Error('Aguarde o carregamento e tente novamente.');
      if (!sw.active) throw new Error('Preparando os avisos. Aguarde alguns segundos e tente novamente.');
      let subscription = await sw.pushManager.getSubscription();
      const key = Uint8Array.from(atob(data.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
      const existingKey = subscription?.options.applicationServerKey;
      if (subscription && existingKey && Array.from(new Uint8Array(existingKey)).join(',') !== Array.from(key).join(',')) {
        await subscription.unsubscribe(); subscription = null;
      }
      subscription ||= await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api.savePushDevice(subscription.toJSON(), name.trim() || 'Meu aparelho');
      setMessage('Aparelho cadastrado. Envie um aviso de teste e confira se ele aparece na tela.');
    });
  };
  const current = data?.devices.find((device) => device.endpointHash === currentHash);
  return <section aria-label="Notificações da loja" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
    <h3 className="font-bold text-slate-900">Receba avisos sem deixar o painel aberto</h3>
    <p className="text-slate-600">Ative em cada celular ou computador que você usa. Novos pedidos e encomendas geram avisos, sem dados pessoais do cliente na tela bloqueada.</p>
    {needsInstall && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">No iPhone/iPad (iOS 16.4 ou superior), abra no Safari, toque em Compartilhar e em Adicionar à Tela de Início. Abra a Pode Vir pelo novo ícone, entre na loja e volte aqui para ativar.</p>}
    {!supported && !needsInstall && <p className="text-amber-900">Este navegador não oferece os avisos aqui. Use HTTPS e um navegador atualizado, como Chrome no Android.</p>}
    {data && !data.publicKey && <p className="text-amber-900">Os avisos ainda precisam ser habilitados pela equipe Pode Vir no servidor. Você pode continuar configurando a loja normalmente.</p>}
    {permission === 'denied' && <p className="text-amber-900">Notificações bloqueadas neste aparelho. Permita os avisos nas configurações do site/navegador ou em Ajustes → Notificações.</p>}
    <p className="font-semibold">Neste aparelho: {current?.enabled && permission === 'granted' ? 'cadastrado para receber avisos' : 'avisos não ativados'}</p>
    <label className="grid gap-1">Nome do aparelho<input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3" placeholder="Ex.: Celular da Ana" /></label>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !supported || needsInstall || !data?.publicKey || permission === 'denied'} onClick={activate}>{current?.enabled ? 'Atualizar este aparelho' : 'Ativar notificações'}</button>
      {current?.enabled && <button type="button" className={button} disabled={busy} onClick={() => run(async () => { await api.testPushDevice(current._id); setMessage('Teste enviado ao serviço de notificações. Confira se o aviso apareceu neste aparelho; isso não comprova recebimento dos próximos avisos.'); })}>Enviar aviso de teste</button>}
      <button type="button" className={button} disabled={busy} onClick={() => run(reload)}>Atualizar situação</button></div>
    <details><summary className="cursor-pointer font-semibold">Meus aparelhos nesta loja ({data?.devices.length || 0})</summary><ul className="mt-2 space-y-3">{data?.devices.map((device) => <li key={device._id} className="rounded-xl border border-slate-200 bg-white p-3"><p>{device.name}{device.endpointHash === currentHash ? ' (este aparelho)' : ''} · {device.enabled ? 'Cadastrado' : 'Precisa reativar'}</p>{device.lastError && <p className="text-xs text-amber-900">{device.lastError}</p>}<button type="button" disabled={busy} className="mt-2 text-sm font-semibold text-red-700 underline" onClick={() => run(async () => { await api.removePushDevice(device._id); setMessage('Avisos desativados para este aparelho nesta loja.'); })}>Desativar avisos neste aparelho</button></li>)}</ul></details>
    {!!data?.pending && <p className="text-amber-900">Há {data.pending} aviso(s) aguardando nova tentativa de envio. Consulte os pedidos no painel.</p>}
    <p className="text-xs text-slate-500">Internet, economia de bateria e Não Perturbe podem afetar os avisos. Só a sua ação no pedido confirma o atendimento. Em aparelhos compartilhados, desative os avisos antes de sair.</p>
    {message && <p role="status" className="text-emerald-800">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
