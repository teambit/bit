import type { AspectSnapshot, NormalizedSnapshot } from './snapshot';

export interface FieldDiff {
  field: string;
  primary: unknown;
  partner: unknown;
}

export interface SnapshotDiff {
  id: string;
  fields: FieldDiff[];
}

/**
 * Diff a single pair of snapshots. Returns null if identical.
 */
export function diffSnapshots(primary: NormalizedSnapshot, partner: NormalizedSnapshot): SnapshotDiff | null {
  const fields: FieldDiff[] = [];

  if (primary.id !== partner.id) fields.push({ field: 'id', primary: primary.id, partner: partner.id });
  if (primary.head !== partner.head) fields.push({ field: 'head', primary: primary.head, partner: partner.head });
  diffStringArray('tags', primary.tags, partner.tags, fields);
  diffStringArray('extensionIds', primary.extensionIds, partner.extensionIds, fields);
  diffAspectArray('extensions', primary.extensions, partner.extensions, fields);
  diffAspectArray('aspects', primary.aspects, partner.aspects, fields);

  if (fields.length === 0) return null;
  return { id: primary.id, fields };
}

export interface ResultDiff {
  missingFromPartner: NormalizedSnapshot[];
  missingFromPrimary: NormalizedSnapshot[];
  componentDiffs: SnapshotDiff[];
}

export function diffResultSets(primary: NormalizedSnapshot[], partner: NormalizedSnapshot[]): ResultDiff {
  const primaryById = new Map(primary.map((s) => [s.id, s]));
  const partnerById = new Map(partner.map((s) => [s.id, s]));

  const missingFromPartner: NormalizedSnapshot[] = [];
  const missingFromPrimary: NormalizedSnapshot[] = [];
  const componentDiffs: SnapshotDiff[] = [];

  for (const [id, primarySnap] of primaryById) {
    const partnerSnap = partnerById.get(id);
    if (!partnerSnap) {
      missingFromPartner.push(primarySnap);
      continue;
    }
    const diff = diffSnapshots(primarySnap, partnerSnap);
    if (diff) componentDiffs.push(diff);
  }

  for (const [id, partnerSnap] of partnerById) {
    if (!primaryById.has(id)) missingFromPrimary.push(partnerSnap);
  }

  return { missingFromPartner, missingFromPrimary, componentDiffs };
}

export function isResultDiffEmpty(diff: ResultDiff): boolean {
  return (
    diff.missingFromPartner.length === 0 && diff.missingFromPrimary.length === 0 && diff.componentDiffs.length === 0
  );
}

function diffStringArray(field: string, a: string[], b: string[], out: FieldDiff[]): void {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    out.push({ field, primary: a, partner: b });
  }
}

function diffAspectArray(field: string, a: AspectSnapshot[], b: AspectSnapshot[], out: FieldDiff[]): void {
  if (a.length !== b.length) {
    out.push({ field, primary: a.map((x) => x.id), partner: b.map((x) => x.id) });
    return;
  }
  for (let i = 0; i < a.length; i++) {
    const ax = a[i];
    const bx = b[i];
    if (ax.id !== bx.id) {
      out.push({ field: `${field}[${i}].id`, primary: ax.id, partner: bx.id });
      continue;
    }
    if (ax.config !== bx.config) {
      out.push({ field: `${field}[${ax.id}].config`, primary: ax.config, partner: bx.config });
    }
  }
}
