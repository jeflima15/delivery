import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, Building2, Tag, MapPin, Loader2 } from 'lucide-react';
import { searchNeighborhoods, NeighborhoodSuggestion } from '../../lib/neighborhoodAutocomplete';

export interface NeighborhoodItem {
  _id?: string;
  id?: string;
  nome: string;
  valor: number;
  tempo_estimado?: string;
  ativo?: boolean;
}

export interface NeighborhoodTierGroup{
  id: string;
  valor: number;
  tempo_estimado: string;
  bairros: string[];
  ativo: boolean;
}

interface Props {
  taxasBairros: NeighborhoodItem[];
  onChange: (updated: NeighborhoodItem[]) => void;
  cidadeLoja?: string;
  estadoLoja?: string;
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

export default function NeighborhoodTierEditor({
  taxasBairros = [],
  onChange,
  cidadeLoja = '',
  estadoLoja = '',
}: Props) {
  const [groups, setGroups] = useState<NeighborhoodTierGroup[]>(() => groupNeighborhoods(taxasBairros));
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, NeighborhoodSuggestion[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
  const [activeDropdownGroup, setActiveDropdownGroup] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const isInternalChange = useRef(false);
  const debounceTimers = useRef<Record<string, any>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setGroups(groupNeighborhoods(taxasBairros));
  }, [taxasBairros]);

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownGroup(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setSuggestions((prev) => ({ ...prev, [groupId]: [] }));
    setActiveDropdownGroup(null);
    setSelectedIndex(-1);
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

  const handleInputChange = (groupId: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [groupId]: value }));
    setActiveDropdownGroup(groupId);
    setSelectedIndex(-1);

    if (debounceTimers.current[groupId]) {
      clearTimeout(debounceTimers.current[groupId]);
    }

    if (!value || value.trim().length < 2) {
      setSuggestions((prev) => ({ ...prev, [groupId]: [] }));
      setLoadingSuggestions((prev) => ({ ...prev, [groupId]: false }));
      return;
    }

    setLoadingSuggestions((prev) => ({ ...prev, [groupId]: true }));
    debounceTimers.current[groupId] = setTimeout(async () => {
      try {
        const results = await searchNeighborhoods(value, {
          cidade: cidadeLoja,
          estado: estadoLoja,
        });
        setSuggestions((prev) => ({ ...prev, [groupId]: results }));
      } catch (err) {
        setSuggestions((prev) => ({ ...prev, [groupId]: [] }));
      } finally {
        setLoadingSuggestions((prev) => ({ ...prev, [groupId]: false }));
      }
    }, 300);
  };

  const totalBairros = groups.reduce((acc, g) => acc + g.bairros.length, 0);

  return (
    <div className="space-y-4" ref={dropdownRef}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group, groupIdx) => {
            const currentInput = inputValues[group.id] || '';
            const groupSuggestions = suggestions[group.id] || [];
            const isLoading = Boolean(loadingSuggestions[group.id]);
            const isDropdownOpen =
              activeDropdownGroup === group.id &&
              currentInput.trim().length >= 2 &&
              (groupSuggestions.length > 0 || isLoading);

            return (
              <div
                key={group.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3.5 transition-all hover:border-slate-300 hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center bg-emerald-50 text-xs font-black text-emerald-700 rounded-lg">
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
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded-lg hover:bg-rose-50"
                      title="Excluir esta faixa de preço"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Campos de Valor e Tempo */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                          className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Tempo (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex.: 30-40 min"
                        value={group.tempo_estimado || ''}
                        onChange={(e) => handleUpdateGroupMeta(group.id, 'tempo_estimado', e.target.value)}
                        className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Input de Adicionar Bairro com Autocomplete Flutuante (FORA DO CONTAINER COM OVERFLOW) */}
                  <div className="relative space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Adicionar Bairro
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="Digite o bairro (ex: Centro, Manejo)..."
                        value={currentInput}
                        onChange={(e) => handleInputChange(group.id, e.target.value)}
                        onFocus={() => {
                          if (currentInput.trim().length >= 2) {
                            setActiveDropdownGroup(group.id);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setSelectedIndex((prev) =>
                              prev < groupSuggestions.length - 1 ? prev + 1 : 0
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setSelectedIndex((prev) =>
                              prev > 0 ? prev - 1 : groupSuggestions.length - 1
                            );
                          } else if (e.key === 'Escape') {
                            setActiveDropdownGroup(null);
                          } else if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            if (
                              selectedIndex >= 0 &&
                              selectedIndex < groupSuggestions.length
                            ) {
                              handleAddTagsToGroup(
                                group.id,
                                groupSuggestions[selectedIndex].tagValue
                              );
                            } else {
                              handleAddTagsToGroup(group.id, currentInput);
                            }
                          }
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          if (
                            pasted &&
                            (pasted.includes(',') ||
                              pasted.includes(';') ||
                              pasted.includes('\n'))
                          ) {
                            e.preventDefault();
                            handleAddTagsToGroup(group.id, pasted);
                          }
                        }}
                        className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-3 pr-16 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                      />

                      <div className="absolute right-1.5 flex items-center gap-1">
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 mr-1" />
                        ) : currentInput.trim().length > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleAddTagsToGroup(group.id, currentInput)}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>

                      {/* Dropdown Flutuante de Sugestões de Bairros (100% livre e sem corte) */}
                      {isDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                            <span>Sugestões</span>
                            <span className="text-[9px] text-slate-400 lowercase">Enter p/ selecionar</span>
                          </div>

                          <div className="max-h-48 overflow-y-auto py-1 space-y-0.5">
                            {isLoading && groupSuggestions.length === 0 ? (
                              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                                <span>Buscando bairros...</span>
                              </div>
                            ) : groupSuggestions.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-500">
                                Pressione <span className="font-bold text-slate-700">Enter</span> para adicionar "{currentInput}"
                              </div>
                            ) : (
                              groupSuggestions.map((item, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleAddTagsToGroup(group.id, item.tagValue)}
                                  className={`w-full text-left flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                                    selectedIndex === idx
                                      ? 'bg-emerald-50 text-emerald-900 font-semibold'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-800 truncate">
                                      {item.district}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {item.city} {item.state ? `, ${item.state}` : ''}
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lista de Bairros Adicionados (Tags) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                        <Tag className="h-3 w-3 text-slate-400" />
                        Bairros cadastrados ({group.bairros.length})
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {group.bairros.length === 0 ? 'Nenhum bairro' : `${group.bairros.length} na lista`}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 min-h-[60px] max-h-[140px] overflow-y-auto flex flex-wrap gap-1.5 items-start content-start">
                      {group.bairros.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic py-3 text-center w-full">
                          Digite o nome do bairro acima para adicionar.
                        </p>
                      ) : (
                        group.bairros.map((bairro) => (
                          <span
                            key={bairro}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs transition-all hover:border-slate-300"
                          >
                            <span>{bairro}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(group.id, bairro)}
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full p-0.5 transition-colors cursor-pointer"
                              title={`Remover ${bairro}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}
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
