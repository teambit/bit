import chalk from 'chalk';
import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import type { Logger } from '@teambit/logger';
import type { Scope as LegacyScope } from '@teambit/legacy.scope';
import type { Repository } from '@teambit/objects';
import type { SourceFile } from '@teambit/component.sources';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { diffBetweenComponentsObjects } from '@teambit/legacy.component-diff';
import { classifyDiffFields } from './context-drift';

type DriftCheckResult =
  | { id: ComponentID; kind: 'git-authored' }
  | { id: ComponentID; kind: 'drift'; recordedBitVersion?: string; changedKeys: string[] };

export type ContextDriftReport = {
  /** dep-only diff vs the recorded version — never snapped by a lane run */
  drift: { id: ComponentID; recordedBitVersion?: string; changedKeys: string[] }[];
  /** pending minus drift: new components and file/config-diff components */
  gitAuthored: ComponentID[];
};

/** relativePath -> content hash, using the same hashing the model persists files with. */
function fileHashes(files: SourceFile[]): Map<string, string> {
  return new Map(files.map((file) => [file.relativePath, file.toSourceAsLinuxEOL().hash().hash]));
}

/** True if any file was added, removed, or its content hash changed. Ignores non-content props. */
function filesContentChanged(recordedFiles: SourceFile[], workspaceFiles: SourceFile[]): boolean {
  const recorded = fileHashes(recordedFiles);
  const workspace = fileHashes(workspaceFiles);
  if (recorded.size !== workspace.size) return true;
  for (const [relativePath, hash] of recorded) {
    if (workspace.get(relativePath) !== hash) return true;
  }
  return false;
}

/** Attribution only: which bit version recorded this component. A lookup failure must not affect the verdict. */
async function getRecordedBitVersion(
  legacyScope: LegacyScope,
  repo: Repository,
  id: ComponentID
): Promise<string | undefined> {
  try {
    const modelComponent = await legacyScope.getModelComponent(id);
    const recorded = await modelComponent.loadVersion(id.version as string, repo);
    return recorded.bitVersion;
  } catch {
    return undefined;
  }
}

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
        const comp = await workspace.get(id);
        const consumerComp = comp.state._consumer;
        const fromModel = consumerComp.componentFromModel;
        if (!fromModel) return { id, kind: 'git-authored' }; // nothing recorded to diff against
        const filesChanged = filesContentChanged(fromModel.files, consumerComp.files);
        const fieldsDiff = await diffBetweenComponentsObjects(fromModel, consumerComp, { verbose: true });
        const fieldNames = (fieldsDiff ?? []).map((f) => f.fieldName);
        const { drift, changedKeys, anomaly } = classifyDiffFields(fieldNames, filesChanged);
        if (anomaly) logger.console(chalk.yellow(`  ${id.toStringWithoutVersion()}: ${anomaly}`));
        if (!drift) return { id, kind: 'git-authored' };
        const recordedBitVersion = await getRecordedBitVersion(legacyScope, repo, id);
        return { id, kind: 'drift', recordedBitVersion, changedKeys };
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
