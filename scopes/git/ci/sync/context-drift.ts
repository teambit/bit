import { isEqual, omit } from 'lodash';

export const DRIFT_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'extensionDependencies',
  'flattenedDependencies',
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  // env-computed dependency data (force:true env policies, e.g. the core react env's dependency
  // template). Keep `extensions` out of this list: a git-side `bit deps set` writes both the
  // component's aspect config (extensions) and the computed overrides — extensions must stay
  // comparable so that change classifies as git-authored.
  'overrides',
] as const;

// Keys that legitimately differ between a recorded Version and one rebuilt
// from the filesystem, independent of any user change.
const VOLATILE_FIELDS = ['log', 'parents', 'squashed', 'origin'] as const;

const EXCLUDED = [...DRIFT_FIELDS, ...VOLATILE_FIELDS];

export function classifyPayloadDiff(
  recorded: Record<string, any>,
  fromFs: Record<string, any>
): { depOnly: boolean; changedKeys: string[] } {
  const keys = new Set([...Object.keys(recorded), ...Object.keys(fromFs)]);
  const changedKeys = [...keys].filter(
    (k) => !(VOLATILE_FIELDS as readonly string[]).includes(k) && !isEqual(recorded[k], fromFs[k])
  );
  const depOnly = isEqual(omit(recorded, EXCLUDED), omit(fromFs, EXCLUDED));
  return { depOnly, changedKeys };
}

export function convergenceMessage(recordedBitVersions: (string | undefined)[], runningBitVersion: string): string {
  const distinct = [...new Set(recordedBitVersions.filter(Boolean))] as string[];
  const recordedPart = distinct.length ? `recorded with bit ${distinct.join(', ')}, ` : '';
  return `chore: align dependency context (${recordedPart}workspace runs bit ${runningBitVersion})`;
}

export function blockerNamesUnion(
  componentsWithIssues: {
    id: { toStringWithoutVersion(): string };
    issues: { getAllIssueNames(): string[]; hasTagBlockerIssues(): boolean };
  }[],
  inSet: Set<string>
): string | undefined {
  const names = new Set<string>();
  for (const entry of componentsWithIssues) {
    if (!inSet.has(entry.id.toStringWithoutVersion())) continue;
    if (!entry.issues.hasTagBlockerIssues()) continue;
    entry.issues.getAllIssueNames().forEach((n) => names.add(n));
  }
  return names.size ? [...names].join(',') : undefined;
}
