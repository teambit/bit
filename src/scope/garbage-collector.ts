import pMap from 'p-map';
import logger from '../logger/logger';
import { Lane, LaneHistory, ModelComponent, ScopeMeta, Source, Version, VersionHistory } from './models';
import Scope, { GarbageCollectorOpts } from './scope';
import { getAllVersionsInfo } from './component-ops/traverse-versions';
import pMapSeries from 'p-map-series';
import { compact, uniq } from 'lodash';
import { Ref } from '@teambit/scope.objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import chalk from 'chalk';
import { VersionNotFound } from './exceptions';

const DELETED_OBJECTS_DIR = 'deleted-objects';

export async function collectGarbage(thisScope: Scope, opts: GarbageCollectorOpts = {}) {
  const repo = thisScope.objects;
  const { verbose, dryRun, findCompIdOrigin, restore, restoreOverwrite, findScopeIdOrigin } = opts;

  if (restore || restoreOverwrite) {
    await repo.restoreFromDir(DELETED_OBJECTS_DIR, restoreOverwrite);
    logger.console(chalk.green(`[*] restored successfully`));
    return;
  }

  const findScopeIdOriginArr = findScopeIdOrigin ? findScopeIdOrigin.split(',').map((s) => s.trim()) : undefined;

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
  const compIdOrigin: Array<{ lane?: string; flattenedOf?: string }> = [];
  const scopeIdOrigin: Array<{ compIdPointer: string; lane?: string; flattenedOf?: string }> = [];
  allLanes.forEach((lane) => {
    refsWhiteList.add(lane.hash().hash);
    const laneHistory = LaneHistory.fromLaneObject(lane);
    refsWhiteList.add(laneHistory.hash().hash);
    const laneIds = lane.toComponentIdsIncludeUpdateDependents();
    const components = laneIds.filter((c) => c.scope !== thisScope.name);
    componentInsideLanes.push(...components);
    if (findCompIdOrigin) {
      const found = laneIds.searchStrWithoutVersion(findCompIdOrigin);
      if (found) compIdOrigin.push({ lane: lane.id() });
    }
    if (findScopeIdOriginArr) {
      const found = laneIds.filter((id) => findScopeIdOriginArr.includes(id.scope));
      found.map((f) => scopeIdOrigin.push({ compIdPointer: f.toString(), lane: lane.id() }));
    }
  });
  const componentInsideLanesUniq = ComponentIdList.uniqFromArray(componentInsideLanes);
  logger.console(`[*] total ${componentInsideLanesUniq.length} components inside lanes`);

  await pMapSeries(componentInsideLanesUniq, async (comp) => {
    const modelComp = await thisScope.getModelComponentIfExist(comp.changeVersion(undefined));
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
      let obj;
      try {
        obj = await ref.load(repo);
      } catch (err: any) {
        if (verbose) logger.console(chalk.red(`error loading ${ref.toString()} ${err.message}`));
        return;
      }
      const id = obj instanceof Version || obj instanceof Source ? '' : obj.id();
      if (verbose) logger.console(`ref ${ref.toString()} ${obj.constructor.name} ${obj.getType()} ${id}`);
      if (obj instanceof ModelComponent) {
        compsToDelete.push(obj.id());
      }
    },
    { concurrency: 20 }
  );

  logger.console(`[*] total ${compsToDelete.length} components to delete:\n${compsToDelete.join('\n')}\n`);

  const printSections = (sections: string[]) => logger.console(compact(sections).join('\n\n'));
  if (findCompIdOrigin) {
    const title = chalk.bold(`\n[*] origin of ${findCompIdOrigin}:`);
    const originLanes = uniq(compact(scopeIdOrigin.filter((c) => !c.flattenedOf).map((c) => c.lane)));
    const flattenedInLanes = compIdOrigin.reduce<Record<string, Set<string>>>((acc, curr) => {
      if (!curr.lane || !curr.flattenedOf) return acc;
      if (!acc[curr.lane]) acc[curr.lane] = new Set<string>();
      acc[curr.lane].add(curr.flattenedOf);
      return acc;
    }, {});
    const flattenedInComps = uniq(compact(compIdOrigin.map((c) => c.flattenedOf && !c.lane)));
    const lanesStr = originLanes.length ? `Found in following lanes:\n${chalk.bold(originLanes.join('\n'))}` : '';
    const flattenedInCompsStr = flattenedInComps.length
      ? `Found in the flattened of the following components:\n${chalk.bold(flattenedInComps.join('\n'))}`
      : '';
    const flattenedInLanesStr = Object.keys(flattenedInLanes).length
      ? `Found in the flattened dependencies of components in the following lanes:\n${Object.keys(flattenedInLanes)
          .map((l) => `${chalk.bold(l)}: flattened of - ${Array.from(flattenedInLanes[l]).join(', ')}`)
          .join('\n')}`
      : '';
    printSections([title, lanesStr, flattenedInCompsStr, flattenedInLanesStr]);
  }
  if (findScopeIdOrigin && !verbose) {
    const title = chalk.bold(`\n[*] origin of scope(s) ${findScopeIdOrigin}:`);
    const originLanes = uniq(compact(scopeIdOrigin.filter((c) => !c.flattenedOf).map((c) => c.lane)));
    const flattenedInLanes = scopeIdOrigin.reduce<Record<string, Set<string>>>((acc, curr) => {
      if (!curr.lane || !curr.flattenedOf) return acc;
      if (!acc[curr.lane]) acc[curr.lane] = new Set<string>();
      acc[curr.lane].add(curr.flattenedOf);
      return acc;
    }, {});
    const flattenedInComps = uniq(compact(scopeIdOrigin.map((c) => c.flattenedOf && !c.lane)));
    const lanesStr = originLanes.length ? `Found in following lanes:\n${chalk.bold(originLanes.join('\n'))}` : '';
    const flattenedInCompsStr = flattenedInComps.length
      ? `Found in the flattened of the following components:\n${chalk.bold(flattenedInComps.join('\n'))}`
      : '';
    const flattenedInLanesStr = Object.keys(flattenedInLanes).length
      ? `Found in the flattened dependencies of components in the following lanes:\n${Object.keys(flattenedInLanes)
          .map((l) => `${chalk.bold(l)}: flattened of - ${Array.from(flattenedInLanes[l]).join(', ')}`)
          .join('\n')}`
      : '';
    printSections([title, lanesStr, flattenedInCompsStr, flattenedInLanesStr]);
  }
  if (findScopeIdOrigin && verbose) {
    const title = chalk.bold(`\n[*] origin of scope(s) ${findScopeIdOrigin}:`);
    const originLanes = uniq(
      compact(
        scopeIdOrigin.map((c) => {
          if (!c.lane || c.flattenedOf) return;
          return `${chalk.bold(c.lane)} (${c.compIdPointer})`;
        })
      )
    );
    const flattenedInLanes = scopeIdOrigin.reduce<Record<string, Set<string>>>((acc, curr) => {
      if (!curr.lane || !curr.flattenedOf) return acc;
      if (!acc[curr.lane]) acc[curr.lane] = new Set<string>();
      acc[curr.lane].add(`${curr.flattenedOf} (${curr.compIdPointer})`);
      return acc;
    }, {});
    const flattenedInComps = uniq(
      compact(
        scopeIdOrigin.map((c) => {
          if (c.lane || !c.flattenedOf) return;
          return `${chalk.bold(c.flattenedOf)} (${c.compIdPointer})`;
        })
      )
    );
    const lanesStr = originLanes.length ? `Found in following lanes:\n${chalk.bold(originLanes.join('\n'))}` : '';
    const flattenedInCompsStr = flattenedInComps.length
      ? `Found in the flattened of the following components:\n${chalk.bold(flattenedInComps.join('\n'))}`
      : '';
    const flattenedInLanesStr = Object.keys(flattenedInLanes).length
      ? `Found in the flattened dependencies of components in the following lanes:\n${Object.keys(flattenedInLanes)
          .map((l) => `${chalk.bold(l)}: flattened of - ${Array.from(flattenedInLanes[l]).join(', ')}`)
          .join('\n')}`
      : '';
    printSections([title, lanesStr, flattenedInCompsStr, flattenedInLanesStr]);
  }

  if (shouldDelete) {
    // move to deleted-objects dir
    await repo.moveObjectsToDir(refsToDelete, DELETED_OBJECTS_DIR);
    await repo.scopeIndex.deleteFile();
    logger.console(chalk.green(`[*] ${refsToDelete.length} refs deleted successfully`));
  }

  async function processDep(dep: string) {
    const depId = ComponentID.fromString(dep);
    const modelComp = await thisScope.getModelComponentIfExist(depId.changeVersion(undefined));
    if (!modelComp) {
      return;
    }
    refsWhiteList.add(modelComp.hash().hash);
    let version: Version | undefined;
    try {
      version = await modelComp.loadVersion(depId.version, repo, false);
    } catch (err: any) {
      if (err instanceof VersionNotFound) return;
      if (err.constructor.name === 'MissingScope') return; // object is corrupted, it's fine to delete it
      logger.console(chalk.red.bold(`error loading a flattened dep ${depId.toString()}`));
      throw err;
    }
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
        const depStr = dep.toString();
        if (allFlattenedDeps.has(depStr)) return;
        allFlattenedDeps.add(depStr);
        if (findCompIdOrigin && dep.toStringWithoutVersion() === findCompIdOrigin) {
          if (originLane) {
            const foundLanes = allLanes.filter((lane) =>
              lane.toComponentIdsIncludeUpdateDependents().searchWithoutVersion(compId)
            );
            if (!foundLanes.length)
              throw new Error(`${compId.toString()} was not found in any lane, it's impossible with "originLane=true"`);
            foundLanes.map((l) => compIdOrigin.push({ flattenedOf: compId.toString(), lane: l.id() }));
          } else {
            compIdOrigin.push({ flattenedOf: compId.toString() });
          }
        }
        if (findScopeIdOriginArr && findScopeIdOriginArr.includes(dep.scope)) {
          if (originLane) {
            const foundLanes = allLanes.filter((lane) =>
              lane.toComponentIdsIncludeUpdateDependents().find((id) => id.scope === compId.scope)
            );
            if (!foundLanes.length)
              throw new Error(`${compId.toString()} was not found in any lane, it's impossible with "originLane=true"`);
            foundLanes.map((l) =>
              scopeIdOrigin.push({ compIdPointer: dep.toString(), flattenedOf: compId.toString(), lane: l.id() })
            );
          } else {
            scopeIdOrigin.push({ compIdPointer: compId.toString(), flattenedOf: dep.toString() });
          }
        }
      });
    });
  }
}
