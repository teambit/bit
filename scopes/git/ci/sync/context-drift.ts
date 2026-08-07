// Field names diffBetweenComponentsObjects (verbose) can emit for a dependency-only change. Any
// other field name means the change is git-authored, not workspace/engine drift.
// `extensionDependencies` alone (a config-less aspect added or removed) also classifies as
// drift: inherent ambiguity, but load-bearing for a config-less aspect version bump that comes
// from an engine template rather than a developer edit.
export const DRIFT_FIELD_NAMES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'extensionDependencies',
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  'overridesDependencies',
  'overridesDevDependencies',
  'overridesPeerDependencies',
] as const;

// files/specs field diffs on unchanged file content come from deprecated per-file props (name,
// test); content truth is the hash compare done by the caller, not this field name.
const CONTENT_FIELDS = ['files', 'specs'];

export type DriftClassification = {
  drift: boolean;
  changedKeys: string[];
  /** set when the component changed but the diff engine names nothing that explains it */
  anomaly?: string;
};

export type FileComparison = {
  /** any file added, removed, or hash-changed — from a content compare, never from field names */
  filesChanged: boolean;
  /** the two file sets cover the exact same relative paths, independently of any hash */
  pathSetsEqual: boolean;
};

/**
 * Classify a diffBetweenComponentsObjects field-name list as dependency-context drift or
 * git-authored. `filesChanged`/`pathSetsEqual` must come from a content compare, not from this
 * field list: a files/specs field diff can fire on unchanged content (deprecated per-file props).
 */
export function classifyDiffFields(
  fieldNames: string[],
  { filesChanged, pathSetsEqual }: FileComparison
): DriftClassification {
  if (filesChanged) return { drift: false, changedKeys: fieldNames };
  const effective = fieldNames.filter((f) => !CONTENT_FIELDS.includes(f));
  if (!effective.length) {
    // files/specs fired with unchanged content: only a deprecated per-file prop (name/test) can
    // explain it, and only if the two sides name the exact same files. Without that second check,
    // this branch is a blanket default that would paper over a broken content compare.
    if (fieldNames.length && pathSetsEqual) return { drift: true, changedKeys: ['deprecated-file-props'] };
    if (fieldNames.length) return { drift: false, changedKeys: fieldNames };
    // no field diff at all, yet the caller reached us because the component is tag-pending.
    return { drift: false, changedKeys: [], anomaly: 'modified without a visible diff' };
  }
  const drift = effective.every((f) => (DRIFT_FIELD_NAMES as readonly string[]).includes(f));
  return { drift, changedKeys: effective };
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

/** Marks the one PR comment `bit ci sync` owns for the drift report (spec 5.6). Not shown to a reader. */
export const DRIFT_COMMENT_MARKER = '<!-- bit-sync-drift-report -->';

/** How many drifted components a report lists before it summarizes the rest, to stay under a git host's comment size limit. */
const MAX_LISTED_DRIFT_COMPONENTS = 50;

type DriftEntry = { id: { toStringWithoutVersion(): string }; recordedBitVersion?: string; changedKeys: string[] };

/**
 * The PR comment body for a lane snap that carried dependency-context drift (spec 5.6). States the
 * cause, lists the affected components and their changed fields, and points at the change request
 * for the full diff. `driftClearedCommentBody` is the counterpart once the drift is gone.
 */
export function driftReportCommentBody(drift: DriftEntry[], runningBitVersion: string): string {
  const recorded = [...new Set(drift.map((d) => d.recordedBitVersion).filter(Boolean))].join(', ');
  const causeLine = recorded
    ? `Cause: the dependency context changed (recorded with bit ${recorded}, running bit ${runningBitVersion}).`
    : `Cause: the dependency context changed.`;
  const entries = drift.map((d) => `- \`${d.id.toStringWithoutVersion()}\` — ${d.changedKeys.join(', ')}`);
  const list =
    entries.length > MAX_LISTED_DRIFT_COMPONENTS
      ? [
          ...entries.slice(0, MAX_LISTED_DRIFT_COMPONENTS),
          `- …and ${entries.length - MAX_LISTED_DRIFT_COMPONENTS} more`,
        ]
      : entries;
  return [
    DRIFT_COMMENT_MARKER,
    '### Dependency-context drift',
    '',
    causeLine,
    'This snap carries the components below as a side effect of the committed context. Git does not show this change.',
    '',
    ...list,
    '',
    'The change request on Bit Cloud shows the full diff.',
  ].join('\n');
}

/** The drift-report comment, updated in place once its drift clears. Never deleted (spec 5.6). */
export function driftClearedCommentBody(): string {
  return [
    DRIFT_COMMENT_MARKER,
    '### Dependency-context drift',
    '',
    'The dependency-context drift this comment reported is gone. The lane matches its dependency context.',
  ].join('\n');
}
