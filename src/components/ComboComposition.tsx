import React from 'react';

export default function ComboComposition({
  stages,
  items,
  fixedItems,
  snapshot,
  className = '',
}: {
  stages?: any[];
  items?: Array<{ produtoId?: string; nome?: string; quantidade?: number; productId?: string; productName?: string; quantity?: number }>;
  fixedItems?: Array<{ produtoId?: string; nome?: string; quantidade?: number; productId?: string; productName?: string; quantity?: number }>;
  snapshot?: any;
  className?: string;
}) {
  const resolvedFixed = fixedItems || items || snapshot?.items;
  const resolvedStages = stages || snapshot?.etapas;

  if (!resolvedStages?.length && !resolvedFixed?.length) return null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {resolvedFixed && resolvedFixed.length > 0 && (
        <div className="space-y-0.5 text-[11px] leading-4 text-gray-500">
          <p className="font-semibold text-gray-700 text-[10px] uppercase tracking-wide">Itens inclusos:</p>
          {resolvedFixed.map((item: any, idx: number) => (
            <p key={item.produtoId || idx} className="pl-2 text-gray-600">
              • {item.quantidade || 1}x {item.nome}
            </p>
          ))}
        </div>
      )}
      {resolvedStages?.map((stage: any, index: number) => (
        <div key={stage.stageId || index} className="text-[11px] leading-4 text-gray-500">
          <p className="font-medium text-gray-700">{stage.name || stage.nome}</p>
          <p className="pl-2">↳ {stage.selectedProductName || stage.produto_nome}</p>
          {(stage.options || stage.adicionais || []).map((option: any, optionIndex: number) => (
            <p key={option.itemId || optionIndex} className="pl-5 text-gray-500">
              • {option.quantity || option.quantidade || 1}x {option.itemName || option.item_nome || option.opcao}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
