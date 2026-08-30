import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, Building2, Tag } from 'lucide-react';

export interface NeighborhoodItem {
  _id?: string;
  id?: string;
  nome: string;
  valor: number;
  tempo_estimado?: string;
  ativo?: boolean;
}

export interface NeighborhoodTierGroup {
  id: string;
  valor: number;
  tempo_estimado: string;
  bairros: string[];
  ativo: boolean;
}

interface Props {
  taxasBairros: NeighborhoodItem[];
  onChange: (updated: NeighborhoodItem[]) => void;
}

function groupNeighborhoods(items: NeighborhoodItem[]): NeighborhoodTierGroup[] {
  if (!items || items.length === 0) return [];
  const map = new Map<string, NeighborhoodTierGroup>();

  items.forEach((item, index) => {
    const valor = Number(item.valor) || 0;
    const tempo = (item.tempo_estimado || '').trim();
    const key = `${valor}__${tempo}`;

    if (!map.has(key)) {
      map.set(key, {
        id: `tier_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        valor,
        tempo_estimado: tempo,
        bairros: [],
        ativo: item.ativo !== false,
      });
    }

    const group = map.get(key);
    if (group && item.nome && typeof item.nome === 'string' && item.nome.trim()) {
      const trimmed = item.nome.trim();
      if (!group.bairros.includes(trimmed)) {
        group.bairros.push(trimmed);
      }
    }
  });

  return Array.from(map.values());
}

function flattenGroups(groups: NeighborhoodTierGroup[]): NeighborhoodItem[] {
  const result: NeighborhoodItem[] = [];
  groups.forEach((g) => {
    const valor = Number(g.valor) || 0;
    const tempo_estimado = (g.tempo_estimado || '').trim();
    const ativo = g.ativo !== false;

    g.bairros.forEach((bairro) => {
      const trimmed = (bairro || '').trim();
      if (trimmed) {
        result.push({
          nome: trimmed,
          valor,
          tempo_estimado,
          ativo,
        });
      }
    });
  });
  return result;
}

export default function NeighborhoodTierEditor({ taxasBairros = [], onChange }: Props) {
  const [groups, setGroups] = useState<NeighborhoodTierGroup[]>(() => groupNeighborhoods(taxasBairros));
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setGroups(groupNeighborhoods(taxasBairros));
  }, [taxasBairros]);

  const notifyChange = (nextGroups: NeighborhoodTierGroup[]) => {
    isInternalChange.current = true;
    setGroups(nextGroups);
    onChange(flattenGroups(nextGroups));
  };

  const handleAddGroup = () => {
    const newGroup: NeighborhoodTierGroup = {
      id: `tier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      valor: 0,
      tempo_estimado: '',
      bairros: [],
      ativo: true,
    };
    notifyChange([...groups, newGroup]);
  };

  const handleRemoveGroup = (groupId: string) => {
    notifyChange(groups.filter((g) => g.id !== groupId));
  };

  const handleUpdateGroupMeta = (groupId: string, field: 'valor' | 'tempo_estimado', val: any) => {
    const next = groups.map((g) => {
      if (g.id !== groupId) return g;
      return { ...g, [field]: val };
    });
    notifyChange(next);
  };

  const handleAddTagsToGroup = (groupId: string, rawText: string) => {
    if (!rawText || !rawText.trim()) return;

    const parts = rawText
      .split(/[,;\n\r]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length === 0) return;

    const next = groups.map((g) => {
      if (g.id !== groupId) {
        return {
          ...g,
          bairros: g.bairros.filter((b) => !parts.some((p) => p.toLowerCase() === b.toLowerCase())),
        };
      }

      const existingLower = new Set(g.bairros.map((b) => b.toLowerCase()));
      const uniqueNew = parts.filter((p) => !existingLower.has(p.toLowerCase()));

      return {
        ...g,
        bairros: [...g.bairros, ...uniqueNew],
      };
    });

    setInputValues((prev) => ({ ...prev, [groupId]: '' }));
    notifyChange(next);
  };

  const handleRemoveTag = (groupId: string, bairroToRemove: string) => {
    const next = groups.map((g) => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        bairros: g.bairros.filter((b) => b.toLowerCase() !== bairroToRemove.toLowerCase()),
      };
    });
    notifyChange(next);
  };

  const totalBairros = groups.reduce((acc, g) => acc + g.bairros.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Tabela de Bairros por Faixas de Preço
          </h4>
          <p className="text-[11px] text-slate-500">
            {totalBairros === 0
              ? 'Organize seus bairros agrupando pelo valor da taxa de entrega.'
              : `${totalBairros} ${totalBairros === 1 ? 'bairro atendido' : 'bairros atendidos'} em ${groups.length} ${groups.length === 1 ? 'faixa de preço' : 'faixas de preço'}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddGroup}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Nova faixa de preço
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-10 text-center bg-slate-50/50">
          <Building2 className="h-9 w-9 text-slate-400 mb-2.5" />
          <p className="text-sm font-bold text-slate-700">Nenhuma faixa de entrega cadastrada</p>
          <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
            Cadastre uma faixa de preço e adicione vários bairros que compartilham o mesmo valor de frete de uma só vez.
          </p>
          <button
            type="button"
            onClick={handleAddGroup}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Criar primeira faixa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group, groupIdx) => {
            const currentInput = inputValues[group.id] || '';

            return (
              <div
                key={group.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition-all hover:border-slate-300 hover:shadow-xs"
              >
                <div className="space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5.5 w-5.5 items-center justify-center bg-emerald-50 text-[11px] font-black text-emerald-700 rounded-md">
                        #{groupIdx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Faixa R$ {(Number(group.valor) || 0).toFixed(2).replace('.', ',')}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {group.bairros.length} {group.bairros.length === 1 ? 'bairro' : 'bairros'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(group.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Excluir esta faixa de preço"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Campos de Valor e Prazo */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                        Valor Frete (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">R$</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="0.00"
                          value={group.valor === 0 ? '' : group.valor}
                          onChange={(e) =>
                            handleUpdateGroupMeta(
                              group.id,
                              'valor',
                              e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-7.5 pr-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                        Tempo (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex.: 30-40 min"
                        value={group.tempo_estimado || ''}
                        onChange={(e) => handleUpdateGroupMeta(group.id, 'tempo_estimado', e.target.value)}
                        className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Caixa de Bairros (Tags) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-600 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3 text-slate-400" />
                        Bairros ({group.bairros.length})
                      </span>
                    </label>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 min-h-[64px] max-h-[140px] overflow-y-auto flex flex-wrap gap-1 items-center transition-all focus-within:border-emerald-500 focus-within:bg-white">
                      {group.bairros.map((bairro) => (
                        <span
                          key={bairro}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-2xs transition-all hover:border-slate-300"
                        >
                          <span>{bairro}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(group.id, bairro)}
                            className="text-slate-400 hover:text-rose-600 rounded-full transition-colors cursor-pointer"
                            title={`Remover ${bairro}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}

                      <div className="flex flex-1 min-w-[130px] items-center gap-1">
                        <input
                          type="text"
                          placeholder={
                            group.bairros.length === 0
                              ? 'Digite o bairro e tecle Enter...'
                              : '+ Bairro...'
                          }
                          value={currentInput}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              handleAddTagsToGroup(group.id, currentInput);
                            }
                          }}
                          onPaste={(e) => {
                            const pasted = e.clipboardData.getData('text');
                            if (pasted && (pasted.includes(',') || pasted.includes(';') || pasted.includes('\n'))) {
                              e.preventDefault();
                              handleAddTagsToGroup(group.id, pasted);
                            }
                          }}
                          onBlur={() => {
                            if (currentInput.trim()) {
                              handleAddTagsToGroup(group.id, currentInput);
                            }
                          }}
                          className="h-6.5 w-full bg-transparent px-1 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none"
                        />

                        {currentInput.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleAddTagsToGroup(group.id, currentInput)}
                            className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition-colors cursor-pointer"
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
