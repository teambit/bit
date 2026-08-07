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
 * Split the tag-pending set into git-authored changes and dependency-context drift. Drift = the
 * diff against the recorded version is confined to dependency data; files and config are identical.
 */
export async function detectContextDrift(workspace: Workspace, logger: Logger): Promise<ContextDriftReport> {
  const pendingIds = await workspace.listTagPendingIds();
  // `export` refuses local-only components; a `legacyBitIds` snap bypasses the pending-path filter
  // that normally removes them (Snapping.getTagPendingComponentsIds), so filter here.
  const localOnly = ComponentIdList.fromArray(workspace.filter.byLocalOnly(pendingIds));
  const pending = pendingIds.filter((id) => !localOnly.hasWithoutVersion(id));
  const legacyScope = workspace.scope.legacyScope;
  const repo = legacyScope.objects;
  // pMapPool preserves input order, keeping the split deterministic.
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
        // Version.id() returns a JSON string. Normalization is required on both sides: the recorded
        // Version was sorted at persist time (consumer.ts sortProperties); the rebuilt one is not.
        const { depOnly, changedKeys } = classifyPayloadDiff(
          normalizePayload(JSON.parse(recorded.id())),
          normalizePayload(JSON.parse(fromFs.id()))
        );
        if (depOnly) return { id, kind: 'drift', recordedBitVersion: recorded.bitVersion, changedKeys };
        return { id, kind: 'git-authored' };
      } catch (e: any) {
        // an unreadable model must not kill the run; degrade to git-authored
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
