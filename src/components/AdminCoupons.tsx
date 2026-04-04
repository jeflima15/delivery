// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, Calendar, Tag, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

export default function AdminCoupons({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [cupons, setCupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    codigo: '',
    tipo: 'fixo',
    valor: '',
    minimo_pedido: 0,
    validade: '',
    usos_restantes: -1
  });

  const fetchCupons = async () => {
    try {
      const res = await fetch('/api/admin/cupons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.sucesso) setCupons(data.cupons);
    } catch (e) {
      showToast('Erro ao buscar cupons', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCupons();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Cupom criado com sucesso!', 'success');
        setIsAdding(false);
        fetchCupons();
        setFormData({ codigo: '', tipo: 'fixo', valor: '', minimo_pedido: 0, validade: '', usos_restantes: -1 });
      }
    } catch (e) {
      showToast('Erro ao salvar cupom', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cupom?')) return;
    try {
      await fetch(`/api/admin/cupons/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      showToast('Cupom removido', 'success');
      fetchCupons();
    } catch (e) {
      showToast('Erro ao remover', 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Buscando cupons ativos...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Ticket className="text-emerald-600" />
            Cupons de Desconto
          </h2>
          <p className="text-gray-500 mt-1">Crie códigos e atraia mais clientes com descontos estratégicos.</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition"
        >
          {isAdding ? 'Cancelar' : <><Plus className="w-5 h-5" /> Novo Cupom</>}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 animate-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Código (Ex: B3X10)</label>
              <input required type="text" value={formData.codigo} onChange={e => setFormData({...formData, codigo: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Tipo</label>
              <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="fixo">Valor Fixo (R$)</option>
                <option value="porcentagem">Porcentagem (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Valor do Desconto</label>
              <input required type="number" step="0.01" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Pedido Mínimo (R$)</label>
              <input type="number" value={formData.minimo_pedido} onChange={e => setFormData({...formData, minimo_pedido: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Validade (Data)</label>
              <input type="date" value={formData.validade} onChange={e => setFormData({...formData, validade: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Limite de Usos (-1 = ∞)</label>
              <input type="number" value={formData.usos_restantes} onChange={e => setFormData({...formData, usos_restantes: parseInt(e.target.value)})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Criar Código de Desconto'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 font-semibold bg-gray-50 border-b border-gray-100">
                <th className="p-5">Código</th>
                <th className="p-5">Tipo</th>
                <th className="p-5">Valor</th>
                <th className="p-5">Min. Pedido</th>
                <th className="p-5">Status / Usos</th>
                <th className="p-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cupons.map((cupom) => (
                <tr key={cupom._id} className="hover:bg-gray-50/10 group transition-colors">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                        <Tag className="w-5 h-5 text-emerald-600" />
                      </div>
                      <span className="font-extrabold text-gray-900 tracking-wider font-mono">{cupom.codigo}</span>
                    </div>
                  </td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${cupom.tipo === 'porcentagem' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {cupom.tipo === 'porcentagem' ? 'Porcentagem' : 'Valor Fixo'}
                    </span>
                  </td>
                  <td className="p-5">
                    <span className="font-bold text-gray-900">
                      {cupom.tipo === 'porcentagem' ? `${cupom.valor}%` : `R$ ${cupom.valor.toFixed(2).replace('.', ',')}`}
                    </span>
                  </td>
                  <td className="p-5">
                    <span className="text-sm text-gray-600">
                      {cupom.minimo_pedido > 0 ? `R$ ${cupom.minimo_pedido.toFixed(2).replace('.', ',')}` : 'Nenhum'}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                         <span className={`w-2 h-2 rounded-full ${cupom.ativo ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                         <span className="text-xs font-bold text-gray-700">{cupom.usos_restantes === -1 ? 'Ilimitado' : `${cupom.usos_restantes} disponíveis`}</span>
                      </div>
                      {cupom.validade && (
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase">
                           <Calendar className="w-3 h-3" />Expira {new Date(cupom.validade).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    <button
                      onClick={() => handleDelete(cupom._id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {cupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400 text-sm italic">Nenhum cupom ativo no momento. Clique em "Novo Cupom" para começar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
