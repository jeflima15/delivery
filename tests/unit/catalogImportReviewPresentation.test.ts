import { describe, expect, it } from 'vitest';
import { buildReviewTasks } from '../../src/components/tenant-admin/catalog-import/reviewPresentation';
import type { CatalogImportDraft } from '../../src/components/tenant-admin/api';

function draft(): CatalogImportDraft {
  return {
    decisions: { excludedEntityKeys: [], resolvedIssueKeys: [] },
    workingPlan: {
      categories: [],
      products: [
        { key: 'combo-1', name: 'Combo Família', kind: 'combo' },
        { key: 'product-1', name: 'X Salada', kind: 'product' },
      ],
      complementGroups: [],
    },
    readiness: { deterministicIssues: [
      { code: 'FIXED_COMBO_EMPTY_ITEMS', severity: 'blocker', message: 'O combo fixo "Combo Família" (combo-1) deve possuir pelo menos 1 item componente.', affectedEntityKeys: ['combo-1'], relatedEvidenceKeys: [] },
      { code: 'MISSING_PRICE', severity: 'blocker', message: 'Preço ausente.', affectedEntityKeys: ['product-1'], relatedEvidenceKeys: [] },
    ] },
    analysis: { data: { unresolved: [] } },
  } as unknown as CatalogImportDraft;
}

describe('apresentação da revisão do cardápio', () => {
  it('transforma bloqueios técnicos em tarefas ligadas aos itens corretos', () => {
    expect(buildReviewTasks(draft())).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityKey: 'combo-1', title: 'Combo Família está sem produtos', action: 'Adicionar produtos ao combo' }),
      expect.objectContaining({ entityKey: 'product-1', title: 'X Salada está sem preço', action: 'Definir preço' }),
    ]));
  });

  it('não mostra como bloqueio ativo um item excluído da importação', () => {
    const current = draft();
    current.decisions.excludedEntityKeys = ['combo-1'];
    expect(buildReviewTasks(current).map((task) => task.entityKey)).not.toContain('combo-1');
  });

  it('abre o grupo ao detectar um problema em uma opção de complemento', () => {
    const current = draft();
    current.workingPlan!.complementGroups = [{ key: 'group-1', name: 'Adicionais', options: [{ key: 'option-1', name: 'Bacon' }] }] as unknown as NonNullable<CatalogImportDraft['workingPlan']>['complementGroups'];
    current.readiness.deterministicIssues = [{ code: 'NEGATIVE_PRICE_DELTA', severity: 'blocker', message: 'Acréscimo inválido.', affectedEntityKeys: ['option-1'], relatedEvidenceKeys: [] }];
    expect(buildReviewTasks(current)[0]).toMatchObject({ entityKey: 'group-1', severity: 'blocker' });
  });
});
