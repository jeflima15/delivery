import React from 'react';

export default function ComboComposition({ stages, className = '' }: { stages?: any[]; className?: string }) {
  if (!stages?.length) return null;
  return <div className={`space-y-2 ${className}`}>
    {stages.map((stage, index) => <div key={stage.stageId || index} className="text-[11px] leading-4 text-gray-500">
      <p className="font-medium text-gray-700">{stage.name || stage.nome}</p>
      <p className="pl-2">↳ {stage.selectedProductName || stage.produto_nome}</p>
      {(stage.options || stage.adicionais || []).map((option: any, optionIndex: number) => <p key={option.itemId || optionIndex} className="pl-5 text-gray-500">• {option.quantity || option.quantidade || 1}x {option.itemName || option.item_nome || option.opcao}</p>)}
    </div>)}
  </div>;
}
