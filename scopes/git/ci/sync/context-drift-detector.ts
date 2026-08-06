import chalk from 'chalk';
import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import type { Logger } from '@teambit/logger';
import { classifyPayloadDiff } from './context-drift';

export type ContextDriftReport = {
  /** dep-only diff vs the recorded version — never snapped by a lane run */
  drift: { id: ComponentID; recordedBitVersion?: string; changedKeys: string[] }[];
  /** pending minus drift: new components and file/config-diff components */
  gitAuthored: ComponentID[];
};

/**
 * Split the tag-pending set into git-authored changes and dependency-context drift.
 * Drift = the diff against the recorded version is confined to dependency data; on a
 * pristine checkout that means git did not touch the component — the resolution
 * context (env template of the pinned engine, root policy) moved instead.
 */
export async function detectContextDrift(workspace: Workspace, logger: Logger): Promise<ContextDriftReport> {
  const pendingIds = await workspace.listTagPendingIds();
  // Local-only components are excluded from the pending set everywhere a snap would run (mirrors
  // Snapping.getTagPendingComponentsIds) — `export` refuses them, and a bare `legacyBitIds` snap
  // (this run's `snapIds` path) skips the pending-list computation that normally does this filtering.
  const localOnly = ComponentIdList.fromArray(workspace.filter.byLocalOnly(pendingIds));
  const pending = pendingIds.filter((id) => !localOnly.hasWithoutVersion(id));
  const legacyScope = workspace.scope.legacyScope;
  const repo = legacyScope.objects;
  const drift: ContextDriftReport['drift'] = [];
  const gitAuthored: ComponentID[] = [];
  for (const id of pending) {
    if (!id.hasVersion()) {
      gitAuthored.push(id); // new component: git-authored by definition
      continue;
    }
    try {
      const modelComponent = await legacyScope.getModelComponent(id);
      const recorded = await modelComponent.loadVersion(id.version as string, repo);
      const comp = await workspace.get(id);
      const consumerComp = comp.state._consumer.clone();
      consumerComp.log = recorded.log; // same normalization as consumer.isComponentModified
      const { version: fromFs } = await legacyScope.sources.consumerComponentToVersion(consumerComp);
      // Version.id() serializes to a JSON string (used for hashing) — parse both sides so the pure
      // helper gets plain objects.
      const { depOnly, changedKeys } = classifyPayloadDiff(JSON.parse(recorded.id()), JSON.parse(fromFs.id()));
      if (depOnly) drift.push({ id, recordedBitVersion: recorded.bitVersion, changedKeys });
      else gitAuthored.push(id);
    } catch (e: any) {
      // best-effort per component: an unreadable model must not kill the run — treat as git-authored
      logger.console(chalk.yellow(`  ${id.toStringWithoutVersion()}: drift check skipped (${e?.message || e})`));
      gitAuthored.push(id);
    }
  }
  return { drift, gitAuthored };
}
