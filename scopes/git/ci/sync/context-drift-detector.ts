import chalk from 'chalk';
import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import type { Logger } from '@teambit/logger';
import type { Scope as LegacyScope } from '@teambit/legacy.scope';
import type { Repository } from '@teambit/objects';
import type { SourceFile } from '@teambit/component.sources';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { diffBetweenComponentsObjects } from '@teambit/legacy.component-diff';
import type { FileComparison } from './context-drift';
import { classifyDiffFields } from './context-drift';

type DriftCheckResult =
  | { id: ComponentID; kind: 'git-authored' }
  | { id: ComponentID; kind: 'drift'; recordedBitVersion?: string; changedKeys: string[] };

export type ContextDriftReport = {
  /** dep-only diff vs the recorded version — a lane run snaps these too, as surfaced side effects */
  drift: { id: ComponentID; recordedBitVersion?: string; changedKeys: string[] }[];
  /** pending minus drift: new components and file/config-diff components */
  gitAuthored: ComponentID[];
};

// SourceFile is Vinyl-based: the path property is `.relative`, not `.relativePath` (that name
// belongs to SourceFileModel). Both `componentFromModel.files` and the workspace component's
// `.files` are SourceFile — `Component.toConsumerComponent` already converts model files to it.
function relPath(file: SourceFile): string {
  return pathNormalizeToLinux(file.relative);
}

/** relativePath -> content hash, using the same hashing the model persists files with. */
function fileHashes(files: SourceFile[]): Map<string, string> {
  return new Map(files.map((file) => [relPath(file), file.toSourceAsLinuxEOL().hash().hash]));
}

function pathsEqual(a: SourceFile[], b: SourceFile[]): boolean {
  const bPaths = new Set(b.map(relPath));
  return a.length === b.length && a.every((file) => bPaths.has(relPath(file)));
}

/**
 * Content truth, independent of the field diff: a files/specs field diff can fire on unchanged
 * content (deprecated per-file props). `pathSetsEqual` is computed structurally, never derived
 * from the hash compare, so a broken hash compare can't fake it. Exported for unit coverage —
 * this is the multi-file content compare, not the diff engine.
 */
export function compareFiles(recordedFiles: SourceFile[], workspaceFiles: SourceFile[]): FileComparison {
  const recorded = fileHashes(recordedFiles);
  const workspace = fileHashes(workspaceFiles);
  const filesChanged =
    recorded.size !== workspace.size || [...recorded].some(([path, hash]) => workspace.get(path) !== hash);
  return { filesChanged, pathSetsEqual: pathsEqual(recordedFiles, workspaceFiles) };
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
  // `export` refuses local-only components, and so does the snap's own tag-pending resolution
  // (`Snapping.getTagPendingComponentsIds`). Filtering them here keeps this split aligned with what
  // the snap actually snaps, or the drift/git-authored ids reported wouldn't match its outcome.
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
        const fileComparison = compareFiles(fromModel.files ?? [], consumerComp.files ?? []);
        // content alone settles it; skip the diff engine (it shells out to `git diff --no-index`
        // per differing aspect config) rather than spend that cost on an already-decided verdict.
        if (fileComparison.filesChanged) return { id, kind: 'git-authored' };
        // diffBetweenComponentsObjects sorts extension config keys in place; the mutation is
        // shallow and hash-idempotent (Version.id() sorts the same way), so it is acceptable on
        // the live object.
        const fieldsDiff = await diffBetweenComponentsObjects(fromModel, consumerComp, { verbose: true });
        const fieldNames = (fieldsDiff ?? []).map((f) => f.fieldName);
        const { drift, changedKeys, anomaly } = classifyDiffFields(fieldNames, fileComparison);
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
