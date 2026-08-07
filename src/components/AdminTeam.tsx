import React, { useEffect, useState } from 'react';
import { MailPlus, ShieldCheck, UserRound, Users, Copy, X, MessageCircle, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const roleLabels: Record<string, string> = {
  tenant_owner: 'Dono da loja',
  tenant_admin: 'Administrador',
  tenant_manager: 'Gerente',
  tenant_operator: 'Operador',
};

const roleBadgeStyles: Record<string, string> = {
  tenant_owner: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-bold',
  tenant_admin: 'bg-blue-50 text-blue-700 font-bold',
  tenant_manager: 'bg-indigo-50 text-indigo-700 font-bold',
  tenant_operator: 'bg-gray-100 text-gray-700 font-bold',
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

  return (
    <div className={`grid gap-5 ${canInvite ? 'xl:grid-cols-[1fr_360px]' : ''}`}>
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Equipe da loja</h2>
              <p className="text-sm text-gray-500">Acessos administrativos vinculados a esta operação.</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-500">Carregando equipe...</p>
          ) : members.length ? (
            members.map((member) => {
              const isOwner = member.role === 'tenant_owner';
              const isSelf = currentAdminEmail && member.accountId?.email?.toLowerCase() === currentAdminEmail.toLowerCase();
              const canDelete = canInvite && !isOwner && !isSelf;

              return (
                <article key={member._id} className="flex items-center gap-3 p-5 transition-colors hover:bg-gray-50/50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100">
                    <UserRound className="h-5 w-5 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900">{member.accountId?.name || 'Usuário convidado'}</p>
                      {isSelf && (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">Você</span>
                      )}
                    </div>
                    <p className="truncate text-sm text-gray-500">{member.accountId?.email || 'Aguardando cadastro'}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs ${roleBadgeStyles[member.role] || 'bg-emerald-50 text-emerald-700 font-bold'}`}>
                      {roleLabels[member.role] || member.role}
                    </span>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setMemberToDelete(member)}
                        title="Remover membro da equipe"
                        className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="p-8 text-center text-sm text-gray-500">Nenhum membro adicional cadastrado.</p>
          )}
        </div>
      </section>

      {canInvite && (
        <section className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MailPlus className="h-5 w-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900">Convidar membro</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Envie acesso individual. Nunca compartilhe a senha principal da loja.
          </p>
          <form onSubmit={invite} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-gray-700">
              E-mail
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-emerald-500"
                placeholder="pessoa@empresa.com"
              />
            </label>
            <label className="block text-sm font-semibold text-gray-700">
              Perfil
              <select
                value={form.role}
                onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3"
              >
                <option value="tenant_operator">Operador - pedidos</option>
                <option value="tenant_manager">Gerente - operação</option>
                <option value="tenant_admin">Administrador - acesso amplo</option>
              </select>
            </label>
            <button
              disabled={inviting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white shadow-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {inviting ? 'Enviando...' : 'Enviar convite'}
            </button>
          </form>
        </section>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-red-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Remover Acesso</h3>
                  <p className="text-xs font-bold text-gray-400">Confirmar exclusão</p>
                </div>
              </div>
              <button
                onClick={() => setMemberToDelete(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 leading-relaxed">
                Tem certeza que deseja remover{' '}
                <strong className="text-gray-900">
                  {memberToDelete.accountId?.name || memberToDelete.accountId?.email || 'este usuário'}
                </strong>{' '}
                da equipe da loja?
              </p>
              <p className="mt-3 text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                Esta pessoa perderá o acesso ao painel administrativo da loja imediatamente.
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMemberToDelete(null)}
                  disabled={!!deletingId}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteMember}
                  disabled={!!deletingId}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deletingId ? 'Removendo...' : 'Sim, remover membro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Link de Convite (WhatsApp / Copiar) */}
      {inviteLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <MailPlus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Convite Gerado</h3>
                  <p className="text-sm font-medium text-emerald-600">{inviteLink.email}</p>
                </div>
              </div>
              <button
                onClick={() => setInviteLink(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              <p className="mb-4 text-sm font-medium leading-relaxed text-gray-500">
                O envio automático de e-mail não está configurado. Compartilhe o link abaixo diretamente com o membro da equipe:
              </p>

              <div className="relative mb-6">
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-600 whitespace-nowrap scrollbar-hide">
                  {inviteLink.url}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink.url);
                    showToast('Link copiado para a área de transferência!', 'success');
                  }}
                  className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm border border-gray-200 transition-all hover:bg-gray-50 active:scale-95"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Olá! Aqui está seu link de convite para acessar o painel administrativo da loja:\n\n${inviteLink.url}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] p-4 font-bold text-white shadow-lg shadow-[#25D366]/20 transition-all hover:bg-[#20bd5a] active:scale-95"
                >
                  <MessageCircle className="h-5 w-5" />
                  Enviar via WhatsApp
                </a>
                <button
                  onClick={() => setInviteLink(null)}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 font-bold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
