import React, { useEffect, useState } from 'react';
import { MailPlus, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const roleLabels: Record<string, string> = { tenant_admin: 'Administrador', tenant_manager: 'Gerente', tenant_operator: 'Operador' };

export default function AdminTeam({ canInvite }: { canInvite: boolean }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'tenant_operator' });

  const load = async () => {
    setLoading(true);
    try { setMembers((await api.listTeam()).items || []); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar equipe', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviting(true);
    try {
      await api.inviteTeamMember(form.email, form.role);
      showToast('Convite enviado com sucesso.', 'success');
      setForm({ email: '', role: 'tenant_operator' });
      await load();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Nao foi possivel enviar o convite.', 'error'); }
    finally { setInviting(false); }
  };

  return (
    <div className={`grid gap-5 ${canInvite ? 'xl:grid-cols-[1fr_360px]' : ''}`}>
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Users className="h-5 w-5" /></div><div><h2 className="font-bold text-gray-900">Equipe da loja</h2><p className="text-sm text-gray-500">Acessos administrativos vinculados a esta operacao.</p></div></div></div>
        <div className="divide-y divide-gray-100">
          {loading ? <p className="p-8 text-center text-sm text-gray-500">Carregando equipe...</p> : members.length ? members.map((member) => <article key={member._id} className="flex items-center gap-3 p-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100"><UserRound className="h-5 w-5 text-gray-500" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-gray-900">{member.accountId?.name || 'Usuario convidado'}</p><p className="truncate text-sm text-gray-500">{member.accountId?.email || 'Aguardando cadastro'}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{roleLabels[member.role] || member.role}</span></article>) : <p className="p-8 text-center text-sm text-gray-500">Nenhum membro adicional cadastrado.</p>}
        </div>
      </section>
      {canInvite && <section className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><MailPlus className="h-5 w-5 text-emerald-600" /><h2 className="font-bold text-gray-900">Convidar membro</h2></div>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">Envie acesso individual. Nunca compartilhe a senha principal da loja.</p>
        <form onSubmit={invite} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-gray-700">E-mail<input required type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-emerald-500" placeholder="pessoa@empresa.com" /></label><label className="block text-sm font-semibold text-gray-700">Perfil<select value={form.role} onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3"><option value="tenant_operator">Operador - pedidos</option><option value="tenant_manager">Gerente - operacao</option><option value="tenant_admin">Administrador - acesso amplo</option></select></label><button disabled={inviting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{inviting ? 'Enviando...' : 'Enviar convite'}</button></form>
      </section>}
    </div>
  );
}
