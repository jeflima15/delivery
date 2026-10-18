import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { mongo } from 'mongoose';

export type IndexSpec = { key: mongo.IndexSpecification; options: mongo.CreateIndexesOptions };
export type IndexInventory = { collection: string; existing: mongo.IndexDescriptionInfo[]; desired: IndexSpec[] };

function semantics(index: IndexSpec) {
  const { unique = false, sparse = false, partialFilterExpression, collation, expireAfterSeconds } = index.options;
  // Mongo expands collation defaults on listIndexes; compare the same defaults
  // without the server's ICU version, retaining all behavior-relevant options.
  const normalizedCollation = collation ? {
    locale: collation.locale, caseLevel: collation.caseLevel ?? false, caseFirst: collation.caseFirst ?? 'off',
    strength: collation.strength ?? 3, numericOrdering: collation.numericOrdering ?? false,
    alternate: collation.alternate ?? 'non-ignorable', maxVariable: collation.maxVariable ?? 'punct',
    normalization: collation.normalization ?? false, backwards: collation.backwards ?? false,
  } : undefined;
  return { key: Object.entries(index.key), unique, sparse, partialFilterExpression, collation: normalizedCollation, expireAfterSeconds };
}

export function equivalentIndex(existing: mongo.IndexDescriptionInfo, desired: IndexSpec): boolean {
  return isDeepStrictEqual(semantics({ key: existing.key, options: existing }), semantics(desired));
}

// Only these historical definitions can be selected. A matching field alone is
// not evidence: names, key order, options and the operator's explicit choice matter.
const legacyDefinitions: Record<string, string[]> = {
  users: ['telefone', 'normalizedPhone'], categories: ['nome'], products: ['nome', 'slug'],
};

function knownLegacy(collection: string, index: mongo.IndexDescriptionInfo): boolean {
  return (legacyDefinitions[collection] || []).some((field) => index.name === `${field}_1`
    && isDeepStrictEqual(index.key, { [field]: 1 }) && index.unique === true
    && Object.keys(index).every((key) => ['v', 'key', 'name', 'unique', 'ns', 'background'].includes(key)));
}

export function planIndexes(inventory: IndexInventory[], selectedDrops: string[] = []) {
  const create: Array<{ collection: string; index: IndexSpec }> = [];
  const drop: Array<{ collection: string; index: mongo.IndexDescriptionInfo }> = [];
  const preserved: string[] = [];
  const candidates: string[] = [];
  const blockers: string[] = [];
  const selected = new Set(selectedDrops);
  for (const entry of inventory) {
    for (const desired of entry.desired) {
      if (entry.existing.some((existing) => equivalentIndex(existing, desired))) continue;
      const name = desired.options.name || Object.entries(desired.key).map(([key, value]) => `${key}_${value}`).join('_');
      if (entry.existing.some((index) => index.name === name)) blockers.push(`${entry.collection}:${name}:definition-conflict`);
      else create.push({ collection: entry.collection, index: desired });
    }
    for (const index of entry.existing) {
      const id = `${entry.collection}:${index.name}`;
      if (knownLegacy(entry.collection, index) && !entry.desired.some((desired) => equivalentIndex(index, desired))) candidates.push(id);
      if (selected.has(id)) {
        selected.delete(id);
        if (!candidates.includes(id)) blockers.push(`${id}:not-an-approved-legacy-definition`);
        else drop.push({ collection: entry.collection, index });
      } else preserved.push(id);
    }
  }
  for (const id of selected) blockers.push(`${id}:not-found`);
  const plan = { create, drop, preserved, candidates, blockers };
  return { ...plan, fingerprint: createHash('sha256').update(JSON.stringify({ inventory, selectedDrops, plan })).digest('hex') };
}
