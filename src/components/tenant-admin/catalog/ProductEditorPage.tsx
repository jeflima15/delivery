import type { ReactNode } from 'react';
export default function ProductEditorPage({ title, name, image, price, formId, busy, readOnly = false, onClose, children }: { title: string; name: string; image?: string; price: number; formId: string; busy: boolean; readOnly?: boolean; onClose: () => void; children: ReactNode }) {
  return <section className="space-y-5 pb-6">
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <div><button type="button" disabled={busy} onClick={onClose} className="min-h-10 text-sm font-medium text-slate-600">← Produtos e combos</button><h2 className="text-xl font-semibold text-slate-900">{title}</h2></div>
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium">Cancelar</button><button type="submit" form={formId} disabled={busy || readOnly} className="min-h-10 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Salvando…' : readOnly ? 'Somente leitura' : 'Salvar alterações'}</button></div>
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white">{children}</div>
      <aside className="hidden rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-28 xl:block"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo do item</p>{image ? <img src={image} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">Sem imagem</div>}<p className="mt-4 break-words font-semibold text-slate-900">{name || 'Nome do produto'}</p><p className="mt-2 text-lg font-semibold text-emerald-800">{Number(price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-3 text-xs leading-5 text-slate-500">A prévia acompanha sua edição. As mudanças entram no catálogo ao salvar.</p></aside>
    </div>
  </section>;
}

