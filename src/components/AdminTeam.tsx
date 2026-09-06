import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Info, MailPlus, MessageCircle, ShieldCheck, Trash2, UserRound, Users, X } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { formatWhatsAppLink } from '../lib/formatters';
import { AdminEmptyState, AdminSectionIntro, AdminStatCard, AdminSurface } from './tenant-admin/AdminUi';

const roleLabels: Record<string, string> = {
  tenant_owner: 'Dono da loja',
  tenant_admin: 'Administrador',
  tenant_manager: 'Gerente',
  tenant_operator: 'Operador',
};

const roleBadgeStyles: Record<string, string> = {
  tenant_owner: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  tenant_admin: 'border-blue-200 bg-blue-50 text-blue-700',
  tenant_manager: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  tenant_operator: 'border-slate-200 bg-slate-100 text-slate-700',
};

const rolePermissionsSummary: Record<string, string[]> = {
  tenant_owner: ['Todos os recursos administrativos da loja', 'Equipe, faturamento e auditoria'],
  tenant_admin: ['Catálogo, pedidos, clientes, cupons e configurações', 'Consulta de equipe e auditoria'],
  tenant_manager: ['Catálogo e pedidos', 'Consulta de clientes, cupons e configurações'],
  tenant_operator: ['Consulta do catálogo', 'Consulta e operação de pedidos'],
};

export default function AdminTeam({ canInvite, currentAdminEmail }: { canInvite: boolean; currentAdminEmail?: string }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'tenant_operator' });
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string } | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRoleInfo, setSelectedRoleInfo] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setMembers((await api.listTeam()).items || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar equipe', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviting(true);
    try {
      const result = await api.inviteTeamMember(form.email, form.role);
      if (result.invitation?.acceptUrl) {
        setInviteLink({ email: form.email, url: result.invitation.acceptUrl });
      } else {
        showToast('Convite enviado com sucesso.', 'success');
      }
      setForm({ email: '', role: 'tenant_operator' });
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível enviar o convite.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    setDeletingId(memberToDelete._id);
    try {
      await api.removeTeamMember(memberToDelete._id);
      showToast('Membro da equipe removido com sucesso!', 'success');
      setMemberToDelete(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao remover membro', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const managementCount = members.filter((member) => member.role === 'tenant_owner' || member.role === 'tenant_admin').length;
  const operationCount = members.filter((member) => member.role === 'tenant_manager' || member.role === 'tenant_operator').length;

  const renderMemberStatus = (member: any) => member.accountId?.active === false ? (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Inativo</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Ativo</span>
  );

  return (
    <div className="space-y-5">
      <AdminSectionIntro title="Equipe da loja" description="Acessos individuais e papéis administrativos vinculados à operação." icon={Users} />

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="Membros" value={loading ? '—' : members.length} description="Acessos vinculados" />
        <AdminStatCard label="Gestão" value={loading ? '—' : managementCount} description="Dono e administradores" />
        <AdminStatCard label="Operação" value={loading ? '—' : operationCount} description="Gerentes e operadores" />
      </div>

      <div className={`grid gap-5 ${canInvite ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <AdminSurface className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-900">Membros cadastrados</h3><p className="text-[11px] text-slate-500">Papéis e situação dos acessos da loja.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{members.length} acesso(s)</span></div>
          {loading ? (
            <p className="p-10 text-center text-xs text-slate-400">Carregando equipe...</p>
          ) : members.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[650px] border-collapse text-left">
                  <thead><tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-4 py-2.5">Membro</th><th className="px-4 py-2.5">Papel</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Entrada</th><th className="px-4 py-2.5 text-right">Ações</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {members.map((member) => {
                      const isOwner = member.role === 'tenant_owner';
                      const memberEmail = member.accountId?.email;
                      const isSelf = Boolean(currentAdminEmail && memberEmail?.toLowerCase() === currentAdminEmail.toLowerCase());
                      const canDelete = canInvite && !isOwner && !isSelf;
                      return <tr key={member._id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600">{member.accountId?.name ? member.accountId.name.charAt(0).toUpperCase() : <UserRound className="h-4 w-4 text-slate-400" />}</div><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="block max-w-[180px] truncate font-semibold text-slate-900">{member.accountId?.name || 'Usuário da equipe'}</span>{isSelf && <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">Você</span>}</div><span className="block max-w-[220px] truncate text-[11px] text-slate-500">{memberEmail || 'Sem e-mail disponível'}</span></div></div></td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${roleBadgeStyles[member.role] || roleBadgeStyles.tenant_operator}`}>{roleLabels[member.role] || member.role}</span></td>
                        <td className="px-4 py-3">{renderMemberStatus(member)}</td>
                        <td className="px-4 py-3 text-[11px] text-slate-500">{member.createdAt ? new Date(member.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-4 py-3 text-right">{canDelete ? <button type="button" aria-label={`Remover ${memberEmail || 'membro'}`} onClick={() => setMemberToDelete(member)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button> : isOwner ? <span className="text-[10px] font-medium italic text-slate-400">Titular</span> : <span className="text-slate-300">—</span>}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {members.map((member) => {
                  const isOwner = member.role === 'tenant_owner';
                  const memberEmail = member.accountId?.email;
                  const isSelf = Boolean(currentAdminEmail && memberEmail?.toLowerCase() === currentAdminEmail.toLowerCase());
                  const canDelete = canInvite && !isOwner && !isSelf;
                  return <article key={member._id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600">{member.accountId?.name ? member.accountId.name.charAt(0).toUpperCase() : <UserRound className="h-4 w-4 text-slate-400" />}</div><div className="min-w-0"><div className="flex items-center gap-1"><p className="truncate text-xs font-bold text-slate-900">{member.accountId?.name || 'Usuário da equipe'}</p>{isSelf && <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-600">Você</span>}</div><p className="truncate text-[11px] text-slate-500">{memberEmail || 'Sem e-mail disponível'}</p></div></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${roleBadgeStyles[member.role] || roleBadgeStyles.tenant_operator}`}>{roleLabels[member.role] || member.role}</span></div><div className="flex items-center justify-between border-t border-slate-50 pt-2">{renderMemberStatus(member)}{canDelete && <button type="button" onClick={() => setMemberToDelete(member)} className="flex items-center gap-1 text-[11px] font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>}</div></article>;
                })}
              </div>
            </>
          ) : <AdminEmptyState title="Nenhum membro cadastrado" description="Convide a equipe para criar acessos individuais e seguros." icon={Users} />}
        </AdminSurface>

        {canInvite && <aside className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><MailPlus className="h-4 w-4 text-emerald-600" /><h3 className="text-xs font-bold text-slate-900">Convidar membro</h3></div>
            <p className="text-xs leading-relaxed text-slate-500">Envie um acesso individual com o papel adequado. Não compartilhe a senha principal da loja.</p>
            <form onSubmit={invite} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">E-mail<input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none transition-colors focus:border-emerald-500" placeholder="pessoa@empresa.com" /></label>
              <label className="block text-xs font-bold text-slate-700">Papel<select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"><option value="tenant_operator">Operador - pedidos</option><option value="tenant_manager">Gerente - operação</option><option value="tenant_admin">Administrador - acesso amplo</option></select></label>
              <button disabled={inviting} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{inviting ? 'Enviando...' : 'Enviar convite'}</button>
            </form>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Info className="h-4 w-4 text-emerald-600" /> Papéis e permissões</div>
            <div className="space-y-2">{Object.entries(roleLabels).map(([role, label]) => <div key={role} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs"><button type="button" onClick={() => setSelectedRoleInfo((current) => current === role ? null : role)} className="flex w-full items-center justify-between text-left text-[11px] font-bold text-slate-800"><span>{label}</span><span className="text-[10px] font-semibold text-emerald-600">{selectedRoleInfo === role ? 'Ocultar' : 'Ver acesso'}</span></button>{selectedRoleInfo === role && <ul className="mt-2 list-disc space-y-1 border-t border-slate-100 pl-4 pt-2 text-[10px] leading-relaxed text-slate-600">{rolePermissionsSummary[role].map((description) => <li key={description}>{description}</li>)}</ul>}</div>)}</div>
          </section>
        </aside>}
      </div>

      {memberToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="remove-member-title"><div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4"><div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></div><div><h3 id="remove-member-title" className="text-sm font-bold text-slate-900">Remover acesso</h3><p className="text-[11px] text-slate-500">Confirme a remoção do membro</p></div></div><button type="button" aria-label="Fechar" onClick={() => setMemberToDelete(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-4 p-5 text-xs"><p className="leading-relaxed text-slate-600">Tem certeza de que deseja remover <strong className="text-slate-900">{memberToDelete.accountId?.name || memberToDelete.accountId?.email || 'este membro'}</strong> da equipe?</p><p className="rounded-xl border border-red-100 bg-red-50 p-3 leading-relaxed text-red-700">Esta pessoa perderá imediatamente o acesso ao painel administrativo da loja.</p><div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setMemberToDelete(null)} disabled={Boolean(deletingId)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancelar</button><button type="button" onClick={handleDeleteMember} disabled={Boolean(deletingId)} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50">{deletingId ? 'Removendo...' : 'Remover acesso'}</button></div></div></div></div>}

      {inviteLink && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="invite-link-title"><div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4"><div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-600"><MailPlus className="h-5 w-5" /></div><div><h3 id="invite-link-title" className="text-sm font-bold text-slate-900">Link de convite gerado</h3><p className="text-[11px] font-semibold text-emerald-600">{inviteLink.email}</p></div></div><button type="button" aria-label="Fechar" onClick={() => setInviteLink(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-4 p-5 text-xs"><p className="leading-relaxed text-slate-500">Compartilhe este link diretamente com o novo membro para que ele conclua o cadastro.</p><div className="relative"><input readOnly value={inviteLink.url} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-20 font-mono text-xs text-slate-700" /><button type="button" onClick={() => { void navigator.clipboard.writeText(inviteLink.url); showToast('Link copiado para a área de transferência!', 'success'); }} className="absolute right-1 top-1 flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50"><Copy className="h-3.5 w-3.5" /> Copiar</button></div><div className="flex flex-col gap-2"><a href={formatWhatsAppLink('', `Olá! Aqui está seu link de convite para acessar o painel administrativo da loja:\n\n${inviteLink.url}`)} target="_blank" rel="noreferrer" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white hover:bg-[#20bd5a]"><MessageCircle className="h-4 w-4" /> Enviar via WhatsApp</a><button type="button" onClick={() => setInviteLink(null)} className="h-10 w-full rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50">Concluir</button></div></div></div></div>}
    </div>
  );
}
