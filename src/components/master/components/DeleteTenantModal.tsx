import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { masterRequest, jsonInit } from '../api';
import type { Tenant } from '../types';
import { Modal, fieldClass, buttonSecondary } from './MasterUI';

interface DeleteTenantModalProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
  onDeleted: () => void;
  notify: (tone: 'success' | 'error' | 'info', message: string) => void;
}

export default function DeleteTenantModal({
  open,
  tenant,
  onClose,
  onDeleted,
  notify,
}: DeleteTenantModalProps) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open || !tenant) return null;

  const handleClose = () => {
    setConfirmSlug('');
    setReason('');
    onClose();
  };

  const handleConfirmDelete = async () => {
    if (confirmSlug.trim().toLowerCase() !== tenant.slug.toLowerCase()) {
      notify('error', 'O slug digitado não confere com o slug da loja.');
      return;
    }

    setBusy(true);
    try {
      await masterRequest(
        `/tenants/${tenant._id}`,
        jsonInit('DELETE', { confirmSlug: confirmSlug.trim(), reason: reason.trim() })
      );
      notify('success', `Loja ${tenant.displayName} e todos os seus usuários foram excluídos permanentemente.`);
      handleClose();
      onDeleted();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Falha ao excluir a loja.');
    } finally {
      setBusy(false);
    }
  };

  const isConfirmed = confirmSlug.trim().toLowerCase() === tenant.slug.toLowerCase();

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Excluir loja ${tenant.displayName}`}
      description="Remoção permanente da loja e de todos os usuários vinculados."
      footer={
        <>
          <button className={buttonSecondary} onClick={handleClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !isConfirmed}
            onClick={handleConfirmDelete}
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Excluindo...' : 'Sim, excluir loja e usuários'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-950/60 p-4 text-red-200">
          <p className="font-bold text-red-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            ATENÇÃO: EXCLUSÃO PERMANENTE!
          </p>
          <p className="mt-2 text-xs leading-relaxed text-red-200/90">
            Esta ação apagará permanentemente a loja <strong className="text-white">{tenant.displayName}</strong> (/<span className="font-mono">{tenant.slug}</span>), além de <strong>TODOS os produtos, pedidos, faturas, configurações e TODOS OS USUÁRIOS E ADMINISTRADORES</strong> criados por ela.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-300">
            Para confirmar, digite <span className="font-mono font-bold text-emerald-400">{tenant.slug}</span> abaixo:
            <input
              type="text"
              className={`${fieldClass} mt-2 font-mono text-emerald-300`}
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              placeholder={tenant.slug}
            />
          </label>
        </div>

        <div>
          <label className="block text-sm text-slate-300">
            Motivo da exclusão (opcional):
            <input
              type="text"
              className={`${fieldClass} mt-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Exclusão de loja de teste do piloto"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
