// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Users, Search, ShoppingBag, Star, Plus, ShieldCheck, Mail, Phone, Calendar } from 'lucide-react';
import { useToast } from './Toast';

export default function AdminClientes({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { showToast } = useToast();

  const fetchClientes = async () => {
    try {
      const res = await fetch('/api/admin/clientes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.sucesso) setClientes(data.clientes);
    } catch (e) {
      showToast('Erro ao buscar clientes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, [token]);

  const handleUpdatePoints = async (userId: string, pontos: number) => {
    try {
      const res = await fetch(`/api/admin/clientes/${userId}/pontos`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pontos })
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Pontos atualizados com sucesso!', 'success');
        fetchClientes();
      }
    } catch (e) {
      showToast('Erro ao atualizar pontos', 'error');
    }
  };

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefone.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando base de clientes...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="text-emerald-600" />
            Gestão de Clientes
          </h2>
          <p className="text-gray-500 mt-1">Veja quem são seus melhores clientes e gerencie fidelidade.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-widest text-gray-400 font-black">
                <th className="p-6">Cliente</th>
                <th className="p-6">Resumo de Compras</th>
                <th className="p-6">Fidelidade</th>
                <th className="p-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredClientes.map((cliente) => (
                <tr key={cliente._id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 font-bold text-lg">
                        {cliente.nome.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-base">{cliente.nome}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-xs text-gray-400 font-medium"><Phone className="w-3 h-3" /> {cliente.telefone}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-400 font-medium"><Calendar className="w-3 h-3" /> {new Date(cliente.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-gray-300" />
                        {cliente.total_pedidos || 0} pedidos realizados
                      </p>
                      <p className="text-xs text-emerald-600 font-bold">LTV: R$ {(cliente.total_gasto || 0).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-50 rounded-xl px-3 py-2 border border-amber-100 flex items-center gap-2">
                         <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                         <span className="font-black text-amber-700 text-sm">{cliente.pontos || 0} pts</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                         onClick={() => {
                           const extra = prompt('Quantos pontos deseja adicionar? (Use números negativos para remover)');
                           if (extra) handleUpdatePoints(cliente._id, (cliente.pontos || 0) + parseInt(extra));
                         }}
                         className="bg-gray-100 hover:bg-emerald-600 hover:text-white text-gray-600 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                       >
                         Gerenciar Pontos
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredClientes.length === 0 && (
            <div className="p-20 text-center text-gray-400 italic">Nenhum cliente encontrado com esse termo.</div>
          )}
        </div>
      </div>
    </div>
  );
}
