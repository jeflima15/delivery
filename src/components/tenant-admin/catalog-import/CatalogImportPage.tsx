import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, FileText, Loader2, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ImagePicker from '../../ImagePicker';
import { useTenantAdminApi } from '../TenantAdminContext';
import type { CatalogImportDraft, CatalogImportReviewOperation } from '../api';
import { cropImageToDataUrl, type BoundingBox } from '../../../lib/cropBox';
import { extractPdfCrops, type PdfPhotoCandidateItem } from '../../../lib/pdfCrop';

const statusLabel: Record<CatalogImportDraft['status'], string> = {
  awaiting_upload: 'Aguardando arquivo', queued: 'Na fila', analyzing: 'Analisando', reviewing: 'Em revisão', confirming: 'Confirmando', completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', expired: 'Expirada',
};

function money(cents: number | null | undefined) {
  return typeof cents === 'number' ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Preço pendente';
}

function importIdFromLocation() {
  return new URLSearchParams(window.location.search).get('import');
}

type UploadPhase = 'preparing' | 'uploading' | 'analyzing' | null;

const uploadPhaseLabel: Record<Exclude<UploadPhase, null>, string> = {
  preparing: 'Preparando o envio',
  uploading: 'Enviando o arquivo',
  analyzing: 'Analisando o cardápio',
};

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, '0')}s`;
}

export default function CatalogImportPage() {
  const api = useTenantAdminApi();
  const [items, setItems] = useState<CatalogImportDraft[]>([]);
  const [current, setCurrent] = useState<CatalogImportDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ preview: Record<string, any>; previewHash: string } | null>(null);
  const [publishMode, setPublishMode] = useState<'review_first' | 'publish_now'>('review_first');
  const reviewInFlight = useRef(false);

  const replaceImportInUrl = useCallback((id?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'importar');
    if (id) params.set('import', id); else params.delete('import');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }, []);

  const loadList = useCallback(async () => {
    const response = await api.listCatalogImports();
    setItems(response.items);
  }, [api]);

  const loadCurrent = useCallback(async (id: string) => {
    const response = await api.getCatalogImport(id);
    setCurrent(response.import);
    setItems((existing) => [response.import, ...existing.filter((entry) => entry.id !== id)]);
    return response.import;
  }, [api]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = importIdFromLocation();
        const response = await api.listCatalogImports();
        if (!active) return;
        setItems(response.items);
        if (id) setCurrent((await api.getCatalogImport(id)).import);
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as importações.'); }
    })();
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!current || !['queued', 'analyzing', 'confirming'].includes(current.status)) return;
    const timer = window.setInterval(() => void loadCurrent(current.id).catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [current?.id, current?.status, loadCurrent]);

  const processingActive = Boolean(uploadPhase) || Boolean(current && ['queued', 'analyzing', 'confirming'].includes(current.status));
  useEffect(() => {
    if (!processingActive) { setElapsedSeconds(0); return; }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [processingActive, current?.id]);

  const selectImport = async (id: string) => {
    setPreview(null); setMessage(''); setUploadPhase(null); setSourceFile(null); setBusy(true);
    try { const item = await loadCurrent(id); setCurrent(item); replaceImportInUrl(id); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a importação.'); }
    finally { setBusy(false); }
  };

  const uploadAndAnalyze = async (file: File) => {
    setBusy(true); setUploadPhase('preparing'); setMessage('Preparando upload…'); setPreview(null);
    let draftId = '';
    try {
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Envie PDF, JPG, PNG ou WebP.');
      setSourceFile(file);
      const created = await api.createCatalogImport();
      const draft = created.import;
      draftId = draft.id;
      setCurrent(draft); replaceImportInUrl(draft.id);
      const signed = await api.signCatalogImportSource(draft.id, file);
      if (!supabase) throw new Error('Storage não configurado no navegador.');
      setUploadPhase('uploading');
      setMessage('Enviando arquivo…');
      const { error } = await supabase.storage.from(signed.upload.bucket).uploadToSignedUrl(signed.upload.path, signed.upload.token, file, { contentType: file.type, cacheControl: '3600' });
      if (error) throw error;
      await api.completeCatalogImportSource(draft.id);
      setUploadPhase('analyzing');
      setMessage('Analisando o cardápio com IA… Você pode sair e voltar depois.');
      const analyzed = await api.analyzeCatalogImport(draft.id);
      setCurrent(analyzed.import); await loadList(); setMessage('');
    } catch (error) {
      if (draftId) await loadCurrent(draftId).catch(() => undefined);
      setMessage(error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.');
    }
    finally { setUploadPhase(null); setBusy(false); }
  };

  const clearHistory = async () => {
    const clearable = items.filter((item) => ['completed', 'failed', 'cancelled', 'expired'].includes(item.status));
    if (clearable.length === 0 || !window.confirm(`Remover ${clearable.length} importação(ões) finalizada(s) deste histórico? Importações em andamento serão preservadas.`)) return;
    setHistoryBusy(true); setMessage('');
    try {
      const response = await api.clearCatalogImportHistory();
      await loadList();
      setMessage(response.cleared === 1 ? '1 importação foi removida do histórico.' : `${response.cleared} importações foram removidas do histórico.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível limpar o histórico.'); }
    finally { setHistoryBusy(false); }
  };

  const apply = async (operations: CatalogImportReviewOperation[]) => {
    if (!current) return;
    if (reviewInFlight.current) { setMessage('Aguarde a alteração anterior terminar.'); return; }
    reviewInFlight.current = true;
    setBusy(true); setMessage('Salvando revisão…'); setPreview(null);
    try { const response = await api.reviewCatalogImport(current.id, current.revision, operations); setCurrent(response.import); setMessage('Alterações salvas.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { reviewInFlight.current = false; setBusy(false); }
  };

  const openSource = async () => {
    if (!current) return;
    try { const { url } = await api.getCatalogImportSourceUrl(current.id); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.'); }
  };

  const createPreview = async () => {
    if (!current) return;
    setBusy(true); setMessage('');
    try { const result = await api.previewCatalogImport(current.id); setPreview(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a prévia.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!current || !preview) return;
    setBusy(true); setMessage('Criando o catálogo com segurança…');
    try {
      await api.confirmCatalogImport(current.id, { expectedRevision: current.revision, previewHash: preview.previewHash, publishMode }, crypto.randomUUID());
      await loadCurrent(current.id); setMessage('Catálogo importado com sucesso.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar a importação.'); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!current || !window.confirm('Cancelar esta importação e remover os arquivos temporários?')) return;
    setBusy(true);
    try { await api.cancelCatalogImport(current.id); setCurrent(null); replaceImportInUrl(); await loadList(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar.'); }
    finally { setBusy(false); }
  };

  const attention = useMemo(() => {
    if (!current?.analysis) return [];
    const resolved = new Set(current.decisions.resolvedIssueKeys || []);
    return current.analysis.data.reviewQueue.filter((entry) => !entry.modelDetails || !resolved.has(entry.modelDetails.key));
  }, [current]);

  if (!current) return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-purple-100 p-3 text-purple-700"><Sparkles /></div><div><h2 className="text-xl font-black text-slate-900">Importar cardápio com IA</h2><p className="mt-1 text-sm text-slate-600">Envie o cardápio atual. A IA monta um rascunho e nada é publicado sem sua confirmação.</p></div></div>
        <label className="mt-8 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-purple-200 bg-purple-50/50 p-6 text-center hover:bg-purple-50">
          {busy ? <Loader2 className="h-10 w-10 animate-spin text-purple-600" /> : <Upload className="h-10 w-10 text-purple-600" />}
          <span className="mt-3 font-bold text-slate-800">{busy ? 'Processando…' : 'Escolha uma imagem ou PDF'}</span>
          <span className="mt-1 text-xs text-slate-500">JPG, PNG ou WebP até o limite configurado; PDF até 20 MiB</span>
          <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAndAnalyze(file); }} />
        </label>
        {message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      </section>
      <RecentImports items={items} onSelect={selectImport} onClear={clearHistory} clearing={historyBusy} />
    </div>
  );

  const processing = processingActive;
  const processingTitle = uploadPhase ? uploadPhaseLabel[uploadPhase] : current.status === 'confirming' ? 'Confirmando catálogo' : current.status === 'queued' ? 'Aguardando nova tentativa' : 'Analisando seu cardápio';
  const completed = current.status === 'completed';
  const analysisData = current.analysis?.data;
  const plan = current.workingPlan;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => { setCurrent(null); setUploadPhase(null); setSourceFile(null); replaceImportInUrl(); setPreview(null); }} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Importações</button>
        <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{uploadPhase ? uploadPhaseLabel[uploadPhase] : statusLabel[current.status]}</span>{!completed && <button type="button" onClick={cancel} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40" title="Cancelar"><X className="h-4 w-4" /></button>}</div>
      </div>
      {message && <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>}

      {processing && <section className="overflow-hidden rounded-3xl border border-purple-200 bg-purple-50 p-8 text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-purple-600" /><h2 className="mt-4 text-lg font-black">{processingTitle}…</h2><p className="mt-2 text-2xl font-black tabular-nums text-purple-700" aria-live="polite">{elapsedLabel(elapsedSeconds)}</p><p className="mt-2 text-sm text-slate-600">{uploadPhase === 'preparing' || uploadPhase === 'uploading' ? 'Mantenha esta página aberta até o envio terminar.' : 'O progresso foi salvo. Você pode sair e voltar depois.'}</p><div className="mx-auto mt-5 h-1.5 max-w-sm overflow-hidden rounded-full bg-purple-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-purple-600" /></div></section>}

      {current.status === 'awaiting_upload' && !uploadPhase && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><AlertTriangle className="h-7 w-7 text-amber-600" /><h2 className="mt-2 font-black text-amber-950">O envio não foi concluído</h2><p className="mt-1 text-sm text-amber-800">Cancele este rascunho e envie o arquivo novamente. Nenhum dado do catálogo foi criado.</p><button type="button" onClick={cancel} className="mt-4 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white">Cancelar e recomeçar</button></section>}

      {current.status === 'failed' && <section className="rounded-3xl border border-red-200 bg-red-50 p-6"><AlertTriangle className="h-7 w-7 text-red-600" /><h2 className="mt-2 font-black text-red-900">A análise não foi concluída</h2><p className="mt-1 text-sm text-red-800">{current.lastError?.message}</p><button type="button" disabled={busy} onClick={() => void api.analyzeCatalogImport(current.id).then((response) => setCurrent(response.import)).catch((error) => setMessage(error.message))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" /> Tentar novamente</button></section>}

      {completed && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7"><Check className="h-9 w-9 text-emerald-600" /><h2 className="mt-3 text-xl font-black text-emerald-950">Catálogo importado</h2><p className="mt-1 text-sm text-emerald-800">A operação foi concluída de forma atômica. Os itens já estão disponíveis no cadastro conforme o modo escolhido.</p></section>}

      {current.status === 'reviewing' && analysisData && plan && (
        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Arquivo</p><p className="mt-1 truncate text-sm font-bold">{current.source?.originalName}</p><button type="button" onClick={openSource} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-purple-700"><FileText className="h-4 w-4" /> Ver original</button></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm"><p><strong>{current.readiness.blockerCount || 0}</strong> bloqueios</p><p><strong>{current.readiness.requiredDecisionCount || 0}</strong> decisões</p><p><strong>{current.readiness.unresolvedDuplicateCount || 0}</strong> duplicidades</p></div>
          </aside>
          <main className="space-y-5">
            {(attention.length > 0 || (analysisData.modelingChoices || []).length > 0) && <ReviewAttention current={current} attention={attention} apply={apply} />}
            <DuplicateReview current={current} apply={apply} />
            <CategoryReview current={current} apply={apply} />
            <SuggestedImages current={current} sourceFile={sourceFile} apply={apply} />
            <ProductReview current={current} apply={apply} />
            <GroupReview current={current} apply={apply} />
            {!preview ? <button type="button" disabled={!current.readiness.canConfirm || busy} onClick={createPreview} className="sticky bottom-4 w-full rounded-2xl bg-[var(--pv-primary)] px-5 py-3 font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40">Visualizar o que será criado</button> : <ConfirmPanel preview={preview.preview} publishMode={publishMode} setPublishMode={setPublishMode} busy={busy} confirm={confirm} />}
          </main>
        </div>
      )}
    </div>
  );
}

async function loadImage(source: string) {
  const image = new Image(); image.src = source;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível abrir a imagem original.')); });
  return image;
}

async function dataUrlToWebp(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o recorte.')), 'image/webp', 0.82));
}

export function buildCatalogImportPhotoSuggestions(current: CatalogImportDraft) {
  const imagePlans = current.workingPlan?.productImages || [];
  const products = current.workingPlan?.products || [];
  const photos = current.analysis?.data.sourceEvidence.photos || [];
  const candidates = current.analysis?.data.sourceEvidence.productCandidates || [];
  return photos.filter((photo) => photo.photoRelation !== 'none').map((photo) => {
    const plan = imagePlans.find((entry) => entry.sourcePhotoKey === photo.photoKey);
    const product = plan ? products.find((entry) => entry.key === plan.productKey) : null;
    const candidate = candidates.find((entry) => entry.candidateKey === photo.candidateKey);
    const photoBox = (photo.photoBox || (plan?.transformation === 'use_full_source_image' ? [0, 0, 1000, 1000] : null)) as BoundingBox | null;
    return { photo, plan, product, candidate, photoBox };
  });
}

function SuggestedImages({ current, sourceFile, apply }: { current: CatalogImportDraft; sourceFile: File | null; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  const api = useTenantAdminApi();
  const [crops, setCrops] = useState<Record<string, string>>({});
  const [cropErrors, setCropErrors] = useState<Record<string, string>>({});
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const [working, setWorking] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const autoGeneratedForRef = useRef('');
  const products = current.workingPlan?.products || [];
  const suggestions = useMemo(() => buildCatalogImportPhotoSuggestions(current), [current.analysis, current.workingPlan]);

  const generate = useCallback(async () => {
    if (!suggestions.some((entry) => entry.photoBox)) return;
    setWorking('generate'); setErrorMessage('');
    try {
      let file = sourceFile;
      if (!file) {
        const { url } = await api.getCatalogImportSourceUrl(current.id);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Não foi possível baixar o arquivo original para gerar as prévias.');
        const blob = await response.blob();
        file = new File([blob], current.source?.originalName || 'cardapio', { type: current.source?.mimeType || blob.type });
      }
      const cropCandidates: PdfPhotoCandidateItem[] = suggestions.flatMap(({ photo, product, candidate, photoBox }) => {
        if (!photoBox) return [];
        return [{ itemKey: photo.photoKey, name: product?.name || candidate?.name || `Foto ${photo.photoKey}`, kind: product?.kind || 'product', pageNumber: photo.pageNumber || 1, photoBox, photoRelation: photo.photoRelation, photoWarning: photo.photoWarning }];
      });
      if (file.type === 'application/pdf') {
        const result = await extractPdfCrops(file, cropCandidates);
        setCrops(result.crops); setCropErrors(result.failedItemKeys);
      }
      else {
        const objectUrl = URL.createObjectURL(file);
        try {
          const image = await loadImage(objectUrl);
          const generated = Object.fromEntries(cropCandidates.map((candidate) => [candidate.itemKey, cropImageToDataUrl(image, candidate.photoBox, 600)]).filter((entry): entry is [string, string] => Boolean(entry[1])));
          setCrops(generated);
          setCropErrors(Object.fromEntries(cropCandidates.filter((candidate) => !generated[candidate.itemKey]).map((candidate) => [candidate.itemKey, 'A região indicada pela IA não pôde ser recortada.'])));
        } finally { URL.revokeObjectURL(objectUrl); }
      }
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Não foi possível gerar os recortes.'); }
    finally { setWorking(''); }
  }, [api, current.id, current.source?.mimeType, current.source?.originalName, sourceFile, suggestions]);

  useEffect(() => {
    const generationKey = `${current.id}:${current.analysis?.analysisHash || current.analysisGeneration}`;
    if (autoGeneratedForRef.current === generationKey || !suggestions.some((entry) => entry.photoBox)) return;
    autoGeneratedForRef.current = generationKey;
    void generate();
  }, [current.analysis?.analysisHash, current.analysisGeneration, current.id, generate, suggestions]);

  const useCrop = async (photoKey: string, productKey: string, dataUrl: string) => {
    setWorking(photoKey); setErrorMessage('');
    try {
      const blob = await dataUrlToWebp(dataUrl);
      const signed = await api.signCatalogImportImage(current.id, { mimeType: 'image/webp', size: blob.size });
      if (!supabase) throw new Error('Storage não configurado no navegador.');
      const { error } = await supabase.storage.from(signed.upload.bucket).uploadToSignedUrl(signed.upload.path, signed.upload.token, blob, { contentType: 'image/webp', cacheControl: '31536000' });
      if (error) throw error;
      await apply([{ type: 'set_image', productKey, url: signed.upload.publicUrl }]);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar a foto.'); }
    finally { setWorking(''); }
  };
  if (!suggestions.length) return <section className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">Fotos sugeridas pela IA</h3><p className="mt-1 text-sm text-slate-500">Nenhuma foto comercial foi identificada no arquivo. Você ainda pode enviar uma imagem manualmente em cada produto.</p></section>;
  return <section className="rounded-3xl border border-purple-200 bg-purple-50/40 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Fotos encontradas pela IA ({suggestions.length})</h3><p className="text-xs text-slate-600">As prévias são recortadas automaticamente, mas só entram no catálogo depois da sua confirmação.</p></div><button type="button" disabled={Boolean(working)} onClick={() => void generate()} className="rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-purple-700 disabled:opacity-50">{working === 'generate' ? 'Gerando prévias…' : 'Gerar novamente'}</button></div>{errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">{errorMessage}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{suggestions.map(({ photo, plan, product, candidate, photoBox }) => { const crop = crops[photo.photoKey]; const target = selectedTargets[photo.photoKey] ?? plan?.productKey ?? ''; const selected = target && Boolean(current.decisions.imageSelections?.[target]); return <div key={photo.photoKey} className="rounded-2xl border border-purple-100 bg-white p-3">{crop ? <img src={crop} alt={`Sugestão para ${product?.name || candidate?.name || 'produto'}`} className="aspect-square w-full rounded-xl object-cover" /> : working === 'generate' ? <div className="grid aspect-square place-items-center rounded-xl bg-purple-50"><div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-purple-600" /><p className="mt-2 text-xs text-slate-500">Gerando recorte…</p></div></div> : <div className="grid aspect-square place-items-center rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">{cropErrors[photo.photoKey] || (!photoBox ? 'A IA encontrou uma imagem, mas não informou uma área segura para recorte.' : 'Prévia indisponível.')}</div>}<div className="mt-3 flex items-start justify-between gap-2"><div><p className="text-sm font-bold">{product?.name || candidate?.name || 'Imagem detectada'}</p><p className="text-[11px] text-slate-500">{photo.photoRelation === 'direct' ? 'Associação direta' : photo.photoRelation === 'shared' ? 'Imagem compartilhada — escolha o produto' : 'Associação ambígua — confirme o produto'}</p></div>{plan && <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{Math.round(plan.confidence * 100)}%</span>}</div><select value={target} onChange={(event) => setSelectedTargets((existing) => ({ ...existing, [photo.photoKey]: event.target.value }))} className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">Escolha o produto</option>{products.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}</select><button type="button" disabled={!crop || !target || Boolean(working)} onClick={() => void useCrop(photo.photoKey, target, crop)} className="mt-2 w-full rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{working === photo.photoKey ? 'Salvando…' : selected ? 'Substituir pela foto sugerida' : 'Usar esta foto'}</button></div>; })}</div></section>;
}

function RecentImports({ items, onSelect, onClear, clearing }: { items: CatalogImportDraft[]; onSelect: (id: string) => void; onClear: () => void; clearing: boolean }) {
  const clearableCount = items.filter((item) => ['completed', 'failed', 'cancelled', 'expired'].includes(item.status)).length;
  return <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-900">Importações recentes</h3>{clearableCount > 0 && <button type="button" onClick={onClear} disabled={clearing} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" title="Remover importações finalizadas do histórico"><Trash2 className="h-3.5 w-3.5" />{clearing ? 'Limpando…' : 'Limpar'}</button>}</div><p className="mt-1 text-xs text-slate-500">Rascunhos ativos são sempre preservados.</p><div className="mt-4 space-y-2">{items.length === 0 && <p className="text-sm text-slate-500">Nenhuma importação ainda.</p>}{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-purple-300 hover:bg-purple-50/40"><p className="truncate text-sm font-bold">{item.source?.originalName || 'Novo rascunho'}</p><div className="mt-1 flex items-center justify-between gap-2"><p className="text-xs text-slate-500">{statusLabel[item.status]}</p><time className="text-[10px] text-slate-400">{new Date(item.updatedAt).toLocaleDateString('pt-BR')}</time></div></button>)}</div></aside>;
}

function ReviewAttention({ current, attention, apply }: { current: CatalogImportDraft; attention: any[]; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  return <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5"><h3 className="font-black text-slate-900">O que precisa da sua atenção</h3><div className="mt-4 space-y-3">{current.analysis?.data.modelingChoices.map((choice) => <div key={choice.key} className="rounded-2xl bg-white p-4"><p className="font-bold">{choice.title}</p><p className="mt-1 text-sm text-slate-600">{choice.description}</p><div className="mt-3 flex flex-wrap gap-2">{choice.alternatives.map((alternative) => <button key={alternative.strategy} type="button" onClick={() => void apply([{ type: 'select_modeling', key: choice.key, strategy: alternative.strategy, expectedRevision: current.revision }])} className={`rounded-xl border px-3 py-2 text-left text-xs ${current.decisions.modeling?.[choice.key]?.strategy === alternative.strategy ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}><strong>{alternative.label}</strong>{alternative.strategy === choice.recommendedStrategy && ' · recomendado'}<span className="mt-1 block text-slate-500">{alternative.description}</span></button>)}</div></div>)}{attention.map((issue) => <div key={issue.key} className="rounded-2xl bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{issue.title}</p><p className="mt-1 text-sm text-slate-600">{issue.description}</p></div>{issue.severity === 'blocker' ? <span className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">Corrija o item abaixo</span> : issue.modelDetails ? <button type="button" onClick={() => void apply([{ type: 'resolve_issue', key: issue.modelDetails!.key }])} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Revisei</button> : <span className="text-xs font-bold text-slate-500">Aviso técnico</span>}</div></div>)}</div></section>;
}

function DuplicateReview({ current, apply }: { current: CatalogImportDraft; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  const duplicates = current.reconciliation.duplicates || [];
  if (!duplicates.length) return null;
  return <section className="rounded-3xl border border-blue-200 bg-blue-50/50 p-5"><h3 className="font-black">Possíveis duplicidades</h3><div className="mt-3 space-y-3">{duplicates.map((duplicate) => <div key={duplicate.entityKey} className="rounded-2xl bg-white p-4"><p className="font-bold">{duplicate.name}</p><p className="text-xs text-slate-500">Já existe: {duplicate.candidates.map((entry) => entry.name).join(', ')}</p>{duplicate.entityType === 'category' && duplicate.resolution?.automatic ? <p className="mt-2 text-xs font-bold text-emerald-700">A categoria existente será reutilizada.</p> : <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void apply([{ type: 'set_duplicate', key: duplicate.entityKey, action: 'reuse_existing', existingId: duplicate.candidates[0]?.id }])} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Usar existente</button><button onClick={() => void apply([{ type: 'set_duplicate', key: duplicate.entityKey, action: 'create' }])} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Criar novo</button><button onClick={() => void apply([{ type: 'set_duplicate', key: duplicate.entityKey, action: 'skip' }])} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Ignorar</button></div>}</div>)}</div></section>;
}

function CategoryReview({ current, apply }: { current: CatalogImportDraft; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">Categorias ({current.workingPlan?.categories.length || 0})</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{current.workingPlan?.categories.map((category) => <form key={category.key} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void apply([{ type: 'edit_category', key: category.key, patch: { name: String(data.get('name') || ''), description: String(data.get('description') || '') } }]); }} className="rounded-2xl border border-slate-200 p-3"><input name="name" defaultValue={category.name} className="w-full rounded-lg border p-2 text-sm font-bold" /><input name="description" defaultValue={category.description} placeholder="Descrição" className="mt-2 w-full rounded-lg border p-2 text-sm" /><button className="mt-2 text-xs font-bold text-purple-700">Salvar categoria</button></form>)}</div></section>;
}

function ProductReview({ current, apply }: { current: CatalogImportDraft; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  const api = useTenantAdminApi();
  const excluded = new Set(current.decisions.excludedEntityKeys || []);
  return <section className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black">Produtos e combos ({current.workingPlan?.products.length || 0})</h3><div className="mt-4 space-y-4">{current.workingPlan?.products.map((product) => <div key={product.key} className={`rounded-2xl border p-4 ${excluded.has(product.key) ? 'opacity-50' : 'border-slate-200'}`}><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const parsed = String(data.get('price') || '').replace(',', '.'); void apply([{ type: 'edit_product', key: product.key, patch: { name: String(data.get('name') || ''), description: String(data.get('description') || ''), categoryKey: String(data.get('categoryKey') || '') || null, ...(product.kind === 'product' ? { basePriceCents: parsed === '' ? null : Math.round(Number(parsed) * 100) } : {}) } }]); }} className="grid gap-3 md:grid-cols-[1fr_180px]"><div><div className="flex gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase">{product.kind === 'combo' ? 'Combo' : 'Produto'}</span>{product.exclusiveToCombo && <span className="rounded bg-purple-100 px-2 py-1 text-[10px] font-bold">Exclusivo de combo</span>}</div><input name="name" defaultValue={product.name} className="mt-2 w-full rounded-lg border p-2 font-bold" /><textarea name="description" defaultValue={product.description || ''} className="mt-2 w-full rounded-lg border p-2 text-sm" rows={2} /><div className="mt-2 grid gap-2 sm:grid-cols-2">{product.kind === 'product' && <input name="price" defaultValue={product.basePriceCents == null ? '' : (product.basePriceCents / 100).toFixed(2)} placeholder="Preço" inputMode="decimal" className="rounded-lg border p-2 text-sm" />}<select name="categoryKey" defaultValue={product.categoryKey || ''} className="rounded-lg border p-2 text-sm"><option value="">Sem categoria</option>{current.workingPlan?.categories.map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}</select></div><div className="mt-3 flex gap-3"><button className="text-xs font-bold text-purple-700">Salvar alterações</button><button type="button" onClick={() => void apply([{ type: 'set_excluded', key: product.key, excluded: !excluded.has(product.key) }])} className="text-xs font-bold text-slate-500">{excluded.has(product.key) ? 'Incluir' : 'Não importar'}</button></div></div><div><ImagePicker compact value={current.decisions.imageSelections?.[product.key] || ''} uploadSigner={({ mimeType, size }) => api.signCatalogImportImage(current.id, { mimeType, size })} onChange={(url) => void apply([{ type: 'set_image', productKey: product.key, url }])} /><p className="mt-2 text-center text-xs text-slate-500">{product.kind === 'product' ? money(product.basePriceCents) : money(product.startingPriceCents)}</p></div></form>{product.kind === 'combo' && <ComboEditor current={current} combo={product} apply={apply} />}</div>)}</div></section>;
}

function ComboEditor({ current, combo, apply }: { current: CatalogImportDraft; combo: Extract<NonNullable<CatalogImportDraft['workingPlan']>['products'][number], { kind: 'combo' }>; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  const products = current.workingPlan?.products.filter((product) => product.kind === 'product') || [];
  const saveBase = (raw: string) => {
    const value = raw.trim() === '' ? null : Math.round(Number(raw.replace(',', '.')) * 100);
    void apply([{ type: 'edit_combo', key: combo.key, combo: { ...combo.combo, comboBasePriceCents: value } }]);
  };
  return <div className="mt-4 border-t border-slate-100 pt-4"><h4 className="text-sm font-black">Composição do combo</h4><label className="mt-2 block text-xs text-slate-500">Preço base<input key={combo.combo.comboBasePriceCents} defaultValue={combo.combo.comboBasePriceCents == null ? '' : (combo.combo.comboBasePriceCents / 100).toFixed(2)} onBlur={(event) => saveBase(event.currentTarget.value)} inputMode="decimal" className="mt-1 w-full max-w-40 rounded-lg border p-2 text-sm" /></label>{combo.combo.mode === 'fixed' ? <div className="mt-3 space-y-2">{combo.combo.items.map((item, index) => <form key={`${item.productKey}-${index}`} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const items = combo.combo.mode === 'fixed' ? combo.combo.items.map((entry, itemIndex) => itemIndex === index ? { productKey: String(data.get('productKey')), quantity: Number(data.get('quantity')) } : entry) : []; if (combo.combo.mode === 'fixed') void apply([{ type: 'edit_combo', key: combo.key, combo: { ...combo.combo, items } }]); }} className="grid grid-cols-[1fr_90px_auto] gap-2"><select name="productKey" defaultValue={item.productKey} className="rounded-lg border p-2 text-sm">{products.map((product) => <option key={product.key} value={product.key}>{product.name}</option>)}</select><input name="quantity" type="number" min={1} max={100} defaultValue={item.quantity} className="rounded-lg border p-2 text-sm" /><button className="text-xs font-bold text-purple-700">Salvar</button></form>)}</div> : <div className="mt-3 space-y-3">{combo.combo.stages.map((stage, stageIndex) => <div key={stage.key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold">{stage.name}</p>{stage.options.map((option, optionIndex) => <form key={`${option.productKey}-${optionIndex}`} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (combo.combo.mode !== 'stages') return; const stages = combo.combo.stages.map((entry, currentStage) => currentStage !== stageIndex ? entry : { ...entry, options: entry.options.map((currentOption, currentOptionIndex) => currentOptionIndex !== optionIndex ? currentOption : { ...currentOption, productKey: String(data.get('productKey')), extraCents: Math.round(Number(String(data.get('extra') || '0').replace(',', '.')) * 100) }) }); void apply([{ type: 'edit_combo', key: combo.key, combo: { ...combo.combo, stages } }]); }} className="mt-2 grid grid-cols-[1fr_110px_auto] gap-2"><select name="productKey" defaultValue={option.productKey} className="rounded-lg border p-2 text-sm">{products.map((product) => <option key={product.key} value={product.key}>{product.name}</option>)}</select><input name="extra" defaultValue={(option.extraCents / 100).toFixed(2)} inputMode="decimal" className="rounded-lg border p-2 text-sm" aria-label="Acréscimo" /><button className="text-xs font-bold text-purple-700">Salvar</button></form>)}</div>)}</div>}</div>;
}

function GroupReview({ current, apply }: { current: CatalogImportDraft; apply: (ops: CatalogImportReviewOperation[]) => Promise<void> }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="font-black">Complementos ({current.workingPlan?.complementGroups.length || 0})</h3>
      <div className="mt-3 space-y-4">
        {current.workingPlan?.complementGroups.map((group) => (
          <div key={group.key} className="rounded-2xl border border-slate-200 p-4">
            <form onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const placement = group.placement.type === 'embedded_product'
                ? { type: 'embedded_product' as const, productKey: String(data.get('embeddedProductKey') || '') }
                : { type: 'shared' as const, productKeys: data.getAll('targetProductKey').map(String), categoryKeys: data.getAll('targetCategoryKey').map(String) };
              void apply([{ type: 'edit_group', key: group.key, patch: {
                name: String(data.get('name') || ''), minimum: Number(data.get('minimum')), maximum: Number(data.get('maximum')),
                required: data.get('required') === 'on', placement,
              } }]);
            }}>
              <input name="name" defaultValue={group.name} className="w-full rounded-lg border p-2 font-bold" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">Mínimo<input name="minimum" type="number" min={0} defaultValue={group.minimum} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
                <label className="text-xs text-slate-500">Máximo<input name="maximum" type="number" min={1} defaultValue={group.maximum} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs font-bold"><input name="required" type="checkbox" defaultChecked={group.required} /> Obrigatório</label>
              {group.placement.type === 'embedded_product' ? (
                <label className="mt-3 block text-xs text-slate-500">Aplicar somente a
                  <select name="embeddedProductKey" defaultValue={group.placement.productKey} className="mt-1 w-full rounded-lg border p-2 text-sm">
                    {current.workingPlan?.products.filter((product) => product.kind === 'product').map((product) => <option key={product.key} value={product.key}>{product.name}</option>)}
                  </select>
                </label>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <fieldset><legend className="text-xs font-bold text-slate-600">Produtos vinculados</legend>{current.workingPlan?.products.filter((product) => product.kind === 'product').map((product) => <label key={product.key} className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" name="targetProductKey" value={product.key} defaultChecked={group.placement.type === 'shared' && group.placement.productKeys.includes(product.key)} />{product.name}</label>)}</fieldset>
                  <fieldset><legend className="text-xs font-bold text-slate-600">Categorias vinculadas</legend>{current.workingPlan?.categories.map((category) => <label key={category.key} className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" name="targetCategoryKey" value={category.key} defaultChecked={group.placement.type === 'shared' && group.placement.categoryKeys.includes(category.key)} />{category.name}</label>)}</fieldset>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <button className="text-xs font-bold text-purple-700">Salvar grupo e vínculos</button>
                <button type="button" onClick={() => {
                  const firstProduct = current.workingPlan?.products.find((product) => product.kind === 'product')?.key || '';
                  const placement = group.placement.type === 'embedded_product'
                    ? { type: 'shared' as const, productKeys: [group.placement.productKey], categoryKeys: [] }
                    : { type: 'embedded_product' as const, productKey: group.placement.productKeys[0] || firstProduct };
                  void apply([{ type: 'edit_group', key: group.key, patch: { placement } }]);
                }} className="text-xs font-bold text-slate-500">{group.placement.type === 'embedded_product' ? 'Transformar em grupo compartilhado' : 'Vincular a um único produto'}</button>
              </div>
            </form>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              {group.options.map((option) => (
                <form key={option.key} onSubmit={(event) => {
                  event.preventDefault(); const data = new FormData(event.currentTarget); const price = String(data.get('price') || '').replace(',', '.');
                  void apply([{ type: 'edit_option', groupKey: group.key, optionKey: option.key, patch: { name: String(data.get('name') || ''), priceDeltaCents: Math.round(Number(price || 0) * 100), maximumPerItem: Number(data.get('maximumPerItem')) } }]);
                }} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_120px_100px_auto]">
                  <input name="name" defaultValue={option.name} className="rounded-lg border p-2 text-sm" />
                  <input name="price" inputMode="decimal" defaultValue={(option.priceDeltaCents / 100).toFixed(2)} className="rounded-lg border p-2 text-sm" aria-label="Acréscimo" />
                  <input name="maximumPerItem" type="number" min={0} max={100} defaultValue={option.maximumPerItem} className="rounded-lg border p-2 text-sm" aria-label="Máximo por opção" />
                  <button className="text-xs font-bold text-purple-700">Salvar</button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfirmPanel({ preview, publishMode, setPublishMode, busy, confirm }: { preview: Record<string, any>; publishMode: 'review_first' | 'publish_now'; setPublishMode: (value: 'review_first' | 'publish_now') => void; busy: boolean; confirm: () => Promise<void> }) {
  return <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><h3 className="text-lg font-black">Pronto para criar</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{['categories', 'products', 'combos', 'complementGroups'].map((key) => <div key={key} className="rounded-xl bg-white p-3 text-xs"><strong className="block text-lg">{preview[key]?.created || 0}</strong>{key}</div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><label className={`rounded-xl border p-3 ${publishMode === 'review_first' ? 'border-emerald-500 bg-white' : 'border-transparent'}`}><input type="radio" checked={publishMode === 'review_first'} onChange={() => setPublishMode('review_first')} /> <strong>Criar para revisar</strong><span className="block text-xs text-slate-600">Itens visíveis ficam inativos.</span></label><label className={`rounded-xl border p-3 ${publishMode === 'publish_now' ? 'border-emerald-500 bg-white' : 'border-transparent'}`}><input type="radio" checked={publishMode === 'publish_now'} onChange={() => setPublishMode('publish_now')} /> <strong>Publicar agora</strong><span className="block text-xs text-slate-600">Disponibiliza os itens imediatamente.</span></label></div><button type="button" disabled={busy} onClick={() => void confirm()} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Confirmar importação</button></section>;
}
