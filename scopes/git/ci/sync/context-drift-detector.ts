import chalk from 'chalk';
import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import type { Logger } from '@teambit/logger';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { classifyPayloadDiff, normalizePayload } from './context-drift';

type DriftCheckResult =
  | { id: ComponentID; kind: 'git-authored' }
  | { id: ComponentID; kind: 'drift'; recordedBitVersion?: string; changedKeys: string[] };

export type ContextDriftReport = {
  /** dep-only diff vs the recorded version — never snapped by a lane run */
  drift: { id: ComponentID; recordedBitVersion?: string; changedKeys: string[] }[];
  /** pending minus drift: new components and file/config-diff components */
  gitAuthored: ComponentID[];
};

/**
 * Split the tag-pending set into git-authored changes and dependency-context drift. Drift means
 * the diff against the recorded version is confined to dependency data. On a pristine checkout,
 * git did not touch the component; the resolution context (env template of the pinned engine,
 * root policy) moved instead.
 */
export async function detectContextDrift(workspace: Workspace, logger: Logger): Promise<ContextDriftReport> {
  const pendingIds = await workspace.listTagPendingIds();
  // Exclude local-only components, matching every snap path (mirrors
  // Snapping.getTagPendingComponentsIds). `export` refuses them, and a bare `legacyBitIds` snap
  // (this run's `snapIds` path) skips the pending-list computation that normally filters them out.
  const localOnly = ComponentIdList.fromArray(workspace.filter.byLocalOnly(pendingIds));
  const pending = pendingIds.filter((id) => !localOnly.hasWithoutVersion(id));
  const legacyScope = workspace.scope.legacyScope;
  const repo = legacyScope.objects;
  // Bounded concurrency (same pattern as sync/main-config-sync.ts): each component's check loads
  // its recorded Version and rebuilds it from the filesystem, which a large pending set shouldn't
  // fire off unbounded. pMapPool preserves input order in its results, so the split below stays
  // deterministic regardless of which component's check resolves first.
  const results = await pMapPool<ComponentID, DriftCheckResult>(
    pending,
    async (id) => {
      if (!id.hasVersion()) {
        return { id, kind: 'git-authored' }; // new component: git-authored by definition
      }
      try {
        const modelComponent = await legacyScope.getModelComponent(id);
        const recorded = await modelComponent.loadVersion(id.version as string, repo);
        const comp = await workspace.get(id);
        const consumerComp = comp.state._consumer.clone();
        consumerComp.log = recorded.log; // same normalization as consumer.isComponentModified
        const { version: fromFs } = await legacyScope.sources.consumerComponentToVersion(consumerComp);
        // Version.id() serializes to a JSON string for hashing. Parse both sides so the pure helper
        // gets plain objects, then normalize file order — the recorded Version was sorted by
        // consumer.ts's sortProperties at persist time, but consumerComponentToVersion's output
        // here is not, so a pure ordering difference would otherwise misclassify as drift.
        const { depOnly, changedKeys } = classifyPayloadDiff(
          normalizePayload(JSON.parse(recorded.id())),
          normalizePayload(JSON.parse(fromFs.id()))
        );
        if (depOnly) return { id, kind: 'drift', recordedBitVersion: recorded.bitVersion, changedKeys };
        return { id, kind: 'git-authored' };
      } catch (e: any) {
        // best-effort per component: an unreadable model must not kill the run — treat as git-authored
        logger.console(chalk.yellow(`  ${id.toStringWithoutVersion()}: drift check skipped (${e?.message || e})`));
        return { id, kind: 'git-authored' };
      }
    },
    { concurrency: concurrentComponentsLimit() }
  );
  const drift: ContextDriftReport['drift'] = [];
  const gitAuthored: ComponentID[] = [];
  for (const r of results) {
    if (r.kind === 'drift')
      drift.push({ id: r.id, recordedBitVersion: r.recordedBitVersion, changedKeys: r.changedKeys });
    else gitAuthored.push(r.id);
  }
  return { drift, gitAuthored };
}
