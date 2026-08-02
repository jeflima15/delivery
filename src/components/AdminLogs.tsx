import React, { useState, useEffect } from 'react';
import { History, Search, ShieldCheck } from 'lucide-react';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

export default function AdminLogs({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.listAuditLogs()
    .then(data => {
      if (!data) return;
      if (data.success) setLogs(data.items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  const filteredLogs = logs.filter(log => 
    log.acao.toLowerCase().includes(searchTerm.toLowerCase()) || 
    log.detalhes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Logs de Auditoria</h2>
          <p className="text-gray-500 mt-1">Monitoramento de segurança e histórico de ações administrativas.</p>
        </div>
        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-emerald-600" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input 
          type="text" 
          placeholder="Filtrar por ação ou detalhe..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-sm font-medium"
        />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Carregando logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">Nenhuma ação registrada.</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log._id} className="p-5 hover:bg-gray-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                    <History className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                       <span className="font-bold text-gray-900">{log.acao}</span>
                       <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] font-bold uppercase tracking-tighter">{log.tabela}</span>
                    </div>
                    <p className="text-sm text-gray-500 leading-snug">{log.detalhes}</p>
                  </div>
                </div>
                <div className="text-left md:text-right shrink-0">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">ID: {log.adminId}</p>
                  <p className="text-sm text-gray-400 font-medium">{new Date(log.createdAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
