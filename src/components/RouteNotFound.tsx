export default function RouteNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f2] p-6 text-center">
      <div><p className="text-xs font-black uppercase tracking-[.24em] text-emerald-600">404</p><h1 className="mt-3 text-3xl font-black text-gray-900">Pagina nao encontrada</h1><p className="mt-3 text-sm text-gray-500">Confira o endereco informado ou volte para a plataforma.</p><a className="mt-7 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white" href="/">Voltar ao inicio</a></div>
    </main>
  );
}
