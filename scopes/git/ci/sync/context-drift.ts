import { isEqual, omit, sortBy } from 'lodash';

// Deprecated per-file props. consumer.isComponentModified copies them from the model before
// comparing; strip them here too, or a stale `name`/`test` value misclassifies as drift.
const DEPRECATED_FILE_PROPS = ['name', 'test'] as const;

export const DRIFT_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'extensionDependencies',
  'flattenedDependencies',
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  // env-computed dependency data (force:true env policies). Excludes `extensions`: `bit deps set`
  // writes both extensions and overrides, and extensions must stay comparable so that change
  // classifies as git-authored.
  'overrides',
] as const;

// Keys that legitimately differ between a recorded Version and one rebuilt
// from the filesystem, independent of any user change.
const VOLATILE_FIELDS = ['log', 'parents', 'squashed', 'origin'] as const;

const EXCLUDED = [...DRIFT_FIELDS, ...VOLATILE_FIELDS];

/**
 * Sort a `Version.id()` payload's `files` (and each file's `dists`) by `relativePath`, and strip
 * the deprecated `name`/`test` props. Mirrors consumer.ts's sortProperties / deprecated-prop
 * alignment, so ordering and stale props don't misclassify as drift.
 */
export function normalizePayload(payload: Record<string, any>): Record<string, any> {
  if (!Array.isArray(payload.files)) return payload;
  const stripDeprecated = (file: Record<string, any>) => omit(file, DEPRECATED_FILE_PROPS);
  return {
    ...payload,
    files: sortBy(payload.files, 'relativePath').map((file: Record<string, any>) => {
      const stripped = stripDeprecated(file);
      return Array.isArray(file.dists)
        ? { ...stripped, dists: sortBy(file.dists, 'relativePath').map(stripDeprecated) }
        : stripped;
    }),
  };
}

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
    issues: {
      getAllIssues(): { isTagBlocker: boolean; constructor: { name: string } }[];
      hasTagBlockerIssues(): boolean;
    };
  }[],
  inSet: Set<string>
): string | undefined {
  const names = new Set<string>();
  for (const entry of componentsWithIssues) {
    if (!inSet.has(entry.id.toStringWithoutVersion())) continue;
    if (!entry.issues.hasTagBlockerIssues()) continue;
    // A non-blocker issue name in `ignoreIssues` is a no-op; only tag-blocker names belong here.
    entry.issues
      .getAllIssues()
      .filter((issue) => issue.isTagBlocker)
      .forEach((issue) => names.add(issue.constructor.name));
  }
  return names.size ? [...names].join(',') : undefined;
}
