import type { EvidenceGroup, Fact, FieldId } from './types';

/**
 * Evidence linking.
 *
 * A group is every value the packet ever asserts for one (entity, field) pair,
 * in the order the documents arrived. That ordering is the whole basis for
 * telling supersession from contradiction later, so it is established here once
 * rather than re-derived inside the classifier.
 */

const FIELD_LABELS: Record<FieldId, string> = {
  effective_date: 'effective date',
  stated_vehicle_count: 'stated fleet size',
  liability_limit: 'liability limit',
  total_scheduled_value: 'total scheduled value',
  garaging_location_count: 'garaging location count',
  loss_summary_claim: 'narrative loss summary',
  vin: 'VIN',
  stated_value: 'stated value',
  garaging_address: 'garaging address',
  year_make_model: 'year / make / model',
  unit_status: 'unit status',
  loss_incurred: 'incurred loss',
  loss_cause: 'loss cause',
  endorsement_add_unit: 'endorsement: unit added',
  endorsement_remove_unit: 'endorsement: unit removed',
  schedule_unit_count: 'units carried on the schedule',
};

/**
 * Fields that feed the cross-document rules rather than standing on their own.
 *
 * Three narrative assertions pulled from one sentence ("two losses", "both
 * minor") are not two readings of one field in disagreement, and a single
 * claim's incurred amount has nothing to be compared against. Grouping them
 * would fill the reviewer's queue with findings that have no question in them.
 * They stay available as facts, cited by the derived rules that use them.
 */
const SUPPORTING_FIELDS = new Set<FieldId>([
  'loss_summary_claim',
  'loss_incurred',
  'loss_cause',
  'unit_status',
  'endorsement_add_unit',
  'endorsement_remove_unit',
  'schedule_unit_count',
]);

export function entityLabel(entityKey: string): string {
  if (entityKey === 'policy') return 'Policy';
  const vehicle = entityKey.match(/^vehicle:unit-(\d+)$/);
  if (vehicle) return `Unit ${vehicle[1]}`;
  const loss = entityKey.match(/^loss:(.+)$/);
  if (loss) return `Claim ${loss[1]}`;
  return entityKey;
}

export function groupLabel(entityKey: string, field: FieldId | string): string {
  const fieldName = FIELD_LABELS[field as FieldId] ?? String(field).replace(/_/g, ' ');
  return `${entityLabel(entityKey)} — ${fieldName}`;
}

export const groupKey = (entityKey: string, field: FieldId | string): string =>
  `${entityKey}::${field}`;

/** Documents first by arrival, then by position, so ties are never arbitrary. */
function chronologically(a: Fact, b: Fact): number {
  const byTime = Date.parse(a.receivedAt) - Date.parse(b.receivedAt);
  if (byTime !== 0) return byTime;
  if (a.documentId !== b.documentId) return a.documentId < b.documentId ? -1 : 1;
  return a.span.start - b.span.start;
}

function entityOrder(entityKey: string): [number, number, string] {
  if (entityKey === 'policy') return [0, 0, ''];
  const vehicle = entityKey.match(/^vehicle:unit-(\d+)$/);
  if (vehicle) return [1, Number(vehicle[1]), ''];
  return [2, 0, entityKey];
}

export function buildEvidenceGroups(facts: Fact[]): EvidenceGroup[] {
  const byKey = new Map<string, Fact[]>();

  for (const fact of facts) {
    if (SUPPORTING_FIELDS.has(fact.field)) continue;
    const key = groupKey(fact.entityKey, fact.field);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(fact);
    else byKey.set(key, [fact]);
  }

  const groups: EvidenceGroup[] = [];
  byKey.forEach((groupFacts, key) => {
    const [entityKey, field] = [groupFacts[0].entityKey, groupFacts[0].field];
    groups.push({
      key,
      entityKey,
      field,
      label: groupLabel(entityKey, field),
      facts: [...groupFacts].sort(chronologically),
      derived: false,
    });
  });

  return groups.sort((a, b) => {
    const [ra, na, sa] = entityOrder(a.entityKey);
    const [rb, nb, sb] = entityOrder(b.entityKey);
    if (ra !== rb) return ra - rb;
    if (na !== nb) return na - nb;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });
}

/** Facts excluded from grouping, kept for the rules that cite them. */
export function supportingFacts(facts: Fact[], field: FieldId): Fact[] {
  return facts.filter((f) => f.field === field).sort(chronologically);
}

export { chronologically };
