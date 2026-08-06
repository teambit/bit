import chalk from 'chalk';
import { compact } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import type { LanesMain } from '@teambit/lanes';
import type { ImporterMain } from '@teambit/importer';
import type { Logger } from '@teambit/logger';
import type { LaneId } from '@teambit/lane-id';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { getDivergeData } from '@teambit/component.snap-distance';
import { ComponentConfigMerger } from '@teambit/config-merger';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';

export type MainConfigSyncDeps = {
  workspace: Workspace;
  lanes: LanesMain;
  importer: ImporterMain;
  logger: Logger;
};

/**
 * Batch-fetch main-side Version objects the config merge needs (heads, then common ancestors),
 * mirroring the lane-merge flows (merge-status-provider / merge-lanes). Best-effort: a fetch
 * hiccup shouldn't abort `bit ci pr` — the merge loop still runs and any component whose object is
 * still missing just logs the existing per-component skip. `label` names which objects for the log.
 */
async function prefetchFromMainForConfigSync(
  { importer, logger }: MainConfigSyncDeps,
  ids: ComponentID[],
  label: string
) {
  if (!ids.length) return;
  try {
    await importer.importObjectsFromMainIfExist(ids, { cache: true });
  } catch (e: any) {
    logger.console(
      chalk.yellow(`Could not pre-fetch main's ${label} for config sync (continuing): ${e?.message || e}`)
    );
  }
}

/**
 * Copied from `merging.main.runtime` (`filterDeletedDependenciesFromConfig`): the config merge
 * can emit deletion markers (`version: '-'`) for deps removed on main. The aspects-merger applies
 * `mergedConfig` verbatim, so strip those here to avoid writing a policy entry with version '-'.
 */
function filterDeletedDependenciesFromConfig(mergeConfig?: Record<string, any>): void {
  const policy: Record<string, Array<{ version?: string }>> | undefined =
    mergeConfig?.[DependencyResolverAspect.id]?.policy;
  if (!policy) return;
  Object.keys(policy).forEach((depType) => {
    const filtered = policy[depType].filter((dep) => dep.version !== '-');
    if (filtered.length === 0) delete policy[depType];
    else policy[depType] = filtered;
  });
}

/**
 * Sync *config-only* changes from main onto the lane — without a full `bit lane merge`.
 *
 * In this workflow git is the source of truth for files: the PR author merges the default branch
 * into their PR branch, so source changes arrive via git. The one thing git can't carry is
 * config that's already been *tagged into objects* on main — e.g. another PR ran `bit env set` /
 * `bit deps set`; those records lived in `.bitmap`, rode git into main, and `bit ci merge` baked
 * them into the component's Version (clearing them from `.bitmap`). A long-running PR's lane
 * would otherwise miss them.
 *
 * A full lane merge is the wrong tool here: it does a 3-way *file* merge and refuses to run while
 * the workspace has modified components — but in `bit ci pr` the workspace is always dirty (the
 * PR's changes, not yet snapped). So instead we do a per-component 3-way merge of the aspect
 * *config only* (base = common ancestor, ours = lane, theirs = main), keeping the PR's config on
 * conflict, and stash the result on an `unmergedComponents` entry's `mergedConfig`. The
 * subsequent `snap` reads it (via the aspects-merger on component load) and bakes main's config
 * into the new snap, while the snap's files still come from the workspace (git). No file
 * checkout, so no clean-workspace requirement.
 */
export async function syncConfigFromMain(deps: MainConfigSyncDeps, laneId: LaneId) {
  const { workspace, lanes, logger } = deps;
  const legacyScope = workspace.scope.legacyScope;
  const repo = legacyScope.objects;
  const mainLaneId = lanes.getDefaultLaneId();
  const currentLane = await lanes.getCurrentLane();
  if (!currentLane) return;
  const workspaceIds = workspace.listIds();

  logger.console(chalk.blue(`Syncing config changes from ${mainLaneId.toString()} into ${laneId.toString()}`));

  // Resolve each lane component's head on main once, keeping only those that are on main and whose
  // lane head differs from it (the rest have nothing to sync). This single pass feeds both the
  // pre-fetch below and the merge loop, so we never load the same ModelComponent twice.
  const componentsToSync = compact(
    await Promise.all(
      currentLane.components.map(async (laneComp) => {
        try {
          const modelComponent = await legacyScope.getModelComponentIfExist(laneComp.id);
          const mainHead = modelComponent?.head; // the component's head on main
          if (!modelComponent || !mainHead || mainHead.isEqual(laneComp.head)) return undefined;
          return { laneComp, modelComponent, mainHead };
        } catch (e: any) {
          // Best-effort per component (same contract as the merge loop below): one component's
          // load failure shouldn't reject Promise.all and abort the whole config sync.
          logger.console(
            chalk.yellow(
              `  ${laneComp.id.toStringWithoutVersion()}: skipping config sync from main (${e?.message || e})`
            )
          );
          return undefined;
        }
      })
    )
  );

  // The lane import (switchToLane) brought each component's lane history plus the lightweight
  // version-history (the parent graph) — that's enough for the diverge check below to see that
  // main is ahead — but NOT the full Version object for main's head wherever main advanced past
  // the lane's fork point. Those objects live only on main and were never fetched. Without them
  // `loadVersion(mainHead)` throws VersionNotFoundOnFS, the per-component catch swallows it as
  // "skipping config sync from main", and the sync silently degrades to a no-op for every
  // diverged component. Pre-fetch main's head objects in one batched remote call (mirroring the
  // lane-merge flows — see merge-status-provider / merge-lanes). Pass the *specific* main-head
  // version so `cache: true` still fetches it: the component already exists locally at its lane
  // version, so a version-less id would look satisfied and skip the remote.
  const mainHeadIds = componentsToSync.map(({ laneComp, mainHead }) => laneComp.id.changeVersion(mainHead.toString()));
  await prefetchFromMainForConfigSync(deps, mainHeadIds, 'head objects');

  // Resolve each component's diverge state up front — before the merge loop — so we can also
  // pre-fetch the common-ancestor objects below. getDivergeData only walks the parent graph,
  // which is already local (switchToLane brings the version-history, and the head pre-fetch above
  // reinforced it), so no full Version object is needed yet. Keep only components where main is
  // actually ahead or diverged; the rest have nothing to bring in from main. Bound the fan-out
  // (getDivergeData traverses each component's version graph) so a lane with many components
  // doesn't spawn one unbounded burst of concurrent graph walks.
  const componentsToMerge = compact(
    await pMapPool(
      componentsToSync,
      async (item) => {
        try {
          const divergeData = await getDivergeData({
            repo,
            modelComponent: item.modelComponent,
            sourceHead: item.laneComp.head,
            targetHead: item.mainHead,
            throws: false,
          });
          if (!divergeData.isTargetAhead() && !divergeData.isDiverged()) return undefined;
          return { ...item, divergeData };
        } catch (e: any) {
          // Best-effort per component (same contract as the merge loop below).
          logger.console(
            chalk.yellow(
              `  ${item.laneComp.id.toStringWithoutVersion()}: skipping config sync from main (${e?.message || e})`
            )
          );
          return undefined;
        }
      },
      { concurrency: concurrentComponentsLimit() }
    )
  );

  // The head pre-fetch above brought main's head Version plus the version-history (parent graph),
  // but NOT the full Version object of the common ancestor (the lane's fork point) for components
  // where the lane and main have BOTH snapped since the fork. The 3-way config merge below loads
  // that base Version (`baseVersion.extensions`); without it, `loadVersion(baseSnap)` throws
  // VersionNotFoundOnFS, the per-component catch swallows it as "skipping config sync from main",
  // and the sync silently no-ops for every diverged component. The fork point lives on main and,
  // like the head, was never fetched (includeVersionHistory carries the graph, not each ancestor's
  // Version). Batch-fetch the bases in one call — same best-effort contract as the head pre-fetch.
  const baseIds = compact(
    componentsToMerge.map(({ laneComp, divergeData }) => {
      const baseSnap = divergeData.commonSnapBeforeDiverge;
      return baseSnap ? laneComp.id.changeVersion(baseSnap.toString()) : undefined;
    })
  );
  await prefetchFromMainForConfigSync(deps, baseIds, 'common-ancestor objects');

  const syncedIds: ComponentID[] = [];
  for (const { laneComp, modelComponent, mainHead, divergeData } of componentsToMerge) {
    try {
      const laneHead = laneComp.head;
      const currentVersion = await modelComponent.loadVersion(laneHead.toString(), repo);
      const otherVersion = await modelComponent.loadVersion(mainHead.toString(), repo);
      // base = common ancestor. When the lane is strictly behind main (no divergence) the common
      // ancestor IS the lane head, so the lane's own aspects serve as the base.
      const baseSnap = divergeData.commonSnapBeforeDiverge;
      const baseVersion = baseSnap ? await modelComponent.loadVersion(baseSnap.toString(), repo) : currentVersion;

      const configMerger = new ComponentConfigMerger(
        laneComp.id.toStringWithoutVersion(),
        workspaceIds,
        undefined, // merging from main (the default lane) — there's no Lane object for it
        currentVersion.extensions,
        baseVersion.extensions,
        otherVersion.extensions,
        laneId.toString(),
        mainLaneId.toString(),
        logger,
        'ours' as MergeStrategy // keep the PR's config on a genuine conflict
      );
      const mergedConfig = configMerger.merge().getSuccessfullyMergedConfig();
      if (!mergedConfig || !Object.keys(mergedConfig).length) continue;

      // Strip dependency deletion markers (version: '-'); the aspects-merger applies mergedConfig
      // as-is, so a leftover '-' would land in the policy.
      filterDeletedDependenciesFromConfig(mergedConfig);

      // Upsert: addEntry throws if an entry for this component already exists. A prior
      // --keep-lane run that crashed mid-snap (or otherwise left unmerged.json entries behind)
      // would otherwise make every later run throw here, skip the component, and keep serving
      // stale config. Remove any existing entry first so repeated runs converge on main's latest.
      legacyScope.objects.unmergedComponents.removeComponent(laneComp.id);
      legacyScope.objects.unmergedComponents.addEntry({
        id: { scope: laneComp.id.scope, name: laneComp.id.fullName },
        head: mainHead,
        laneId: mainLaneId,
        mergedConfig,
      });
      syncedIds.push(laneComp.id);
      logger.console(
        chalk.blue(
          `  ${laneComp.id.toStringWithoutVersion()}: applying main's config (${Object.keys(mergedConfig).join(', ')})`
        )
      );
    } catch (e: any) {
      // Best-effort per component: one component's config-merge quirk shouldn't abort the whole
      // `bit ci pr`. Log and move on — the build just won't reflect that component's main-side
      // config this run.
      logger.console(
        chalk.yellow(`  ${laneComp.id.toStringWithoutVersion()}: skipping config sync from main (${e?.message || e})`)
      );
    }
  }

  if (!syncedIds.length) {
    logger.console(chalk.blue('No config changes from main to sync'));
    return;
  }
  await legacyScope.objects.unmergedComponents.write();
  // The components were already loaded (and their aspects cached) earlier in this run, before the
  // unmergedComponents entries existed. Clear the cache so the upcoming `snap` reloads them and
  // the aspects-merger folds in the synced `mergedConfig`.
  workspace.clearAllComponentsCache();
  logger.console(chalk.green(`Synced config from main for ${syncedIds.length} component(s)`));
}
