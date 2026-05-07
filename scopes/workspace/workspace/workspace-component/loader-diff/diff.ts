import type { NormalizedSnapshot } from './snapshot';

export interface FieldDiff {
  field: keyof NormalizedSnapshot | `${keyof NormalizedSnapshot}[${number}]`;
  primary: unknown;
  partner: unknown;
}

export interface SnapshotDiff {
  id: string;
  fields: FieldDiff[];
}

/**
 * Diff a single pair of snapshots. Returns null if identical.
 *
 * Both snapshots are produced by serializeComponentForDiff and are already
 * normalized (sorted arrays, stable key order), so a structural compare is
 * sufficient.
 */
export function diffSnapshots(primary: NormalizedSnapshot, partner: NormalizedSnapshot): SnapshotDiff | null {
  const fields: FieldDiff[] = [];

  if (primary.id !== partner.id) {
    fields.push({ field: 'id', primary: primary.id, partner: partner.id });
  }
  if (primary.head !== partner.head) {
    fields.push({ field: 'head', primary: primary.head, partner: partner.head });
  }
  diffStringArray('tags', primary.tags, partner.tags, fields);
  diffStringArray('extensionIds', primary.extensionIds, partner.extensionIds, fields);

  if (fields.length === 0) return null;
  return { id: primary.id, fields };
}

/**
 * Diff a result set: lists of snapshots from primary and partner.
 *
 * Components present on one side but not the other are reported as a
 * "missing" diff with the full snapshot in the present-side field.
 */
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

function diffStringArray(field: keyof NormalizedSnapshot, a: string[], b: string[], out: FieldDiff[]): void {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    out.push({ field, primary: a, partner: b });
  }
}
