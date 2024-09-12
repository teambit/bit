import pMap from 'p-map';
import logger from '../logger/logger';
import { Lane, LaneHistory, ModelComponent, ScopeMeta, Source, Version, VersionHistory } from './models';
import Scope, { GarbageCollectorOpts } from './scope';
import { getAllVersionsInfo } from './component-ops/traverse-versions';
import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import { Ref } from './objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import chalk from 'chalk';

const DELETED_OBJECTS_DIR = 'deleted-objects';

export async function collectGarbage(thisScope: Scope, opts: GarbageCollectorOpts = {}) {
  const repo = thisScope.objects;
  const { verbose, dryRun, findCompIdOrigin, restore, restoreOverwrite, findScopeIdOrigin } = opts;

  if (restore || restoreOverwrite) {
    await repo.restoreFromDir(DELETED_OBJECTS_DIR, restoreOverwrite);
    logger.console(chalk.green(`[*] restored successfully`));
    return;
  }

  const allRefs = await repo.listRefs();
  logger.console(`scope ${thisScope.name} has ${allRefs.length} refs`);
  const list = await repo.list([ModelComponent, Lane, ScopeMeta]);
  const refsWhiteList = new Set<string>();
  logger.console(`total ${list.length} refs of ModelComponent, Lane and ScopeMeta`);
  const compsOfThisScope: ModelComponent[] = [];
  const compsOfOtherScopes: ModelComponent[] = [];
  const lanes: Lane[] = [];
  const lanesInTrash: Lane[] = [];
  list.forEach((object) => {
    if (object instanceof ModelComponent) {
      if (object.scope === thisScope.name) {
        compsOfThisScope.push(object);
        return;
      }
      compsOfOtherScopes.push(object);
      return;
    }
    if (object instanceof Lane) {
      lanes.push(object);
      return;
    }
    if (object instanceof ScopeMeta) {
      refsWhiteList.add(object.hash().hash);
      return;
    }
  });
  logger.console(`[*] total ${compsOfThisScope.length} refs of ModelComponent of this scope`);
  logger.console(`[*] total ${compsOfOtherScopes.length} refs of ModelComponent of other scopes`);
  logger.console(`[*] total ${lanes.length} refs of Lane`);

  const trash = await repo.listTrash();
  const trashObjects = await repo.getFromTrash(trash);
  await pMap(
    trashObjects,
    async (obj) => {
      if (obj instanceof Lane) {
        lanesInTrash.push(obj);
      }
    },
    { concurrency: 20 }
  );
  logger.console(`[*] total ${trash.length} refs in the trash, total ${lanesInTrash.length} lanes in the trash`);
  const allLanes = [...lanes, ...lanesInTrash];

  const allFlattenedDeps = new Set<string>();

  await pMapSeries(compsOfThisScope, async (comp) => {
    await processComponent(comp, comp.head, true);
  });

  logger.console(`[*] completed processing local components. total ${refsWhiteList.size} refs in the white list`);
  const componentInsideLanes: ComponentID[] = [];
  const origin: string[] = [];
  allLanes.forEach((lane) => {
    refsWhiteList.add(lane.hash().hash);
    const laneHistory = LaneHistory.fromLaneObject(lane);
    refsWhiteList.add(laneHistory.hash().hash);
    const laneIds = lane.toComponentIdsIncludeUpdateDependents();
    const components = laneIds.filter((c) => c.scope !== thisScope.name);
    componentInsideLanes.push(...components);
    if (findCompIdOrigin) {
      const found = laneIds.searchStrWithoutVersion(findCompIdOrigin);
      if (found) origin.push(`lane ${lane.id()}`);
    }
    if (findScopeIdOrigin) {
      const found = laneIds.filter((id) => id.scope === findScopeIdOrigin);
      found.map((f) => origin.push(`lane ${lane.id()}: ${f.toString()}`));
    }
  });
  const componentInsideLanesUniq = ComponentIdList.uniqFromArray(componentInsideLanes);
  logger.console(`[*] total ${componentInsideLanesUniq.length} components inside lanes`);

  await pMapSeries(componentInsideLanesUniq, async (comp) => {
    const modelComp = await thisScope.getModelComponentIfExist(comp);
    if (!modelComp) return;
    await processComponent(modelComp, Ref.from(comp.version), false, true);
  });

  logger.console(`[*] completed processing lanes. total ${refsWhiteList.size} refs in the white list`);

  logger.console(`[*] start processing ${allFlattenedDeps.size} flattened dependencies`);
  const flattenedDeps = Array.from(allFlattenedDeps);
  await pMap(
    flattenedDeps,
    async (dep) => {
      await processDep(dep);
    },
    { concurrency: 20 }
  );

  logger.console(
    `[*] completed processing ${allFlattenedDeps.size} flattened dependencies. total ${refsWhiteList.size} refs in the white list`
  );

  const refsToDelete = allRefs.filter((ref) => !refsWhiteList.has(ref.toString()));

  logger.console(`[*] total ${refsToDelete.length} refs to delete`);

  const compsToDelete: string[] = [];
  const shouldDelete = !dryRun && !findCompIdOrigin && !findScopeIdOrigin;

  await pMap(
    refsToDelete,
    async (ref) => {
      const obj = await ref.load(repo);
      const id = obj instanceof Version || obj instanceof Source ? '' : obj.id();
      if (verbose) logger.console(`deleting ${ref.toString()} ${obj.constructor.name} ${obj.getType()} ${id}`);
      if (obj instanceof ModelComponent) {
        compsToDelete.push(obj.id());
      }
    },
    { concurrency: 20 }
  );

  logger.console(`[*] total ${compsToDelete.length} components to delete:\n${compsToDelete.join('\n')}\n`);

  if (findCompIdOrigin) {
    const title = chalk.bold(`[*] origin of ${findCompIdOrigin}:`);
    logger.console(`${title}\n${origin.join('\n')}`);
  }
  if (findScopeIdOrigin) {
    const title = chalk.bold(`[*] origin of scope ${findScopeIdOrigin}:`);
    logger.console(`${title}\n${origin.join('\n')}`);
  }

  if (shouldDelete) {
    // move to deleted-objects dir
    await repo.moveObjectsToDir(refsToDelete, DELETED_OBJECTS_DIR);
    await repo.scopeIndex.deleteFile();
    logger.console(chalk.green(`[*] ${refsToDelete.length} refs deleted successfully`));
  }

  async function processDep(dep: string) {
    const depId = ComponentID.fromString(dep);
    const modelComp = await thisScope.getModelComponentIfExist(depId);
    if (!modelComp) {
      return;
    }
    refsWhiteList.add(modelComp.hash().hash);
    const version = await modelComp.loadVersion(depId.version, repo, false);
    if (!version) {
      return;
    }
    refsWhiteList.add(version.hash().hash);
    const refs = version.refsWithOptions(false, true);
    refs.forEach((ref) => refsWhiteList.add(ref.hash));
  }

  async function processComponent(
    comp: ModelComponent,
    startFrom?: Ref,
    shouldSearchInOtherLanes?: boolean,
    originLane?: boolean
  ) {
    const compId = comp.toComponentId();
    if (verbose) logger.console(`** processing ${compId.toString()} **`);

    refsWhiteList.add(comp.hash().hash);
    const versionHistory = VersionHistory.fromId(compId.name, compId.scope);
    refsWhiteList.add(versionHistory.hash().hash);

    const stopAt: Ref[] = [];
    const versionObjects: Version[] = [];
    if (startFrom) {
      const allVersionInfo = await getAllVersionsInfo({
        modelComponent: comp,
        repo,
        startFrom,
      });
      allVersionInfo.map((v) => stopAt.push(v.ref));
      allVersionInfo.map((v) => v.version && versionObjects.push(v.version));
    }
    if (shouldSearchInOtherLanes) {
      const headsFromOtherLanes = compact(lanes.map((lane) => lane.getCompHeadIncludeUpdateDependents(compId)));

      await pMap(
        headsFromOtherLanes,
        async (head) => {
          const allVersionInfo = await getAllVersionsInfo({
            modelComponent: comp,
            repo,
            startFrom: head,
            stopAt,
            throws: false,
          });
          allVersionInfo.map((v) => v.version && versionObjects.push(v.version));
        },
        { concurrency: 5 }
      );
      if (verbose)
        logger.console(
          `total ${versionObjects.length} versions, total lanes with this component ${headsFromOtherLanes.length}`
        );
    } else {
      if (verbose) logger.console(`total ${versionObjects.length} versions`);
    }

    await pMap(versionObjects, async (version) => {
      refsWhiteList.add(version.hash().hash);
      const refs = version.refsWithOptions(false, true);
      refs.forEach((ref) => refsWhiteList.add(ref.hash));
      version.flattenedDependencies.forEach((dep) => {
        allFlattenedDeps.add(dep.toString());
        if (findCompIdOrigin && dep.toStringWithoutVersion() === findCompIdOrigin) {
          if (originLane) {
            const foundLanes = allLanes.filter((lane) =>
              lane.toComponentIdsIncludeUpdateDependents().searchStrWithoutVersion(findCompIdOrigin)
            );
            origin.push(`flatten of ${compId.toString()}, found in lanes: ${foundLanes.map((l) => l.id()).join(', ')}`);
          } else {
            origin.push(`flatten of ${compId.toString()}`);
          }
        }
        if (findScopeIdOrigin && dep.scope === findCompIdOrigin) {
          if (originLane) {
            const foundLanes = allLanes.filter((lane) =>
              lane.toComponentIdsIncludeUpdateDependents().find((id) => id.scope === findCompIdOrigin)
            );
            origin.push(
              `flatten of ${compId.toString()} (${dep.toString()}), found in lanes: ${foundLanes
                .map((l) => l.id())
                .join(', ')}`
            );
          } else {
            origin.push(`flatten of ${compId.toString()} (${dep.toString()})`);
          }
        }
      });
    });
  }
}
