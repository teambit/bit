import graphLib, { Graph } from 'graphlib';
import R from 'ramda';
import pMapSeries from 'p-map-series';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { MergeConflictOnRemote, MergeConflict } from '../exceptions';
import ComponentObjects from '../component-objects';
import { ComponentTree, LaneTree } from '../repositories/sources';
import { Ref, BitObject } from '../objects';
import { ModelComponent, Symlink, Version, Lane } from '../models';
import { getScopeRemotes } from '../scope-remotes';
import ScopeComponentsImporter from './scope-components-importer';
import { Remotes, Remote } from '../../remotes';
import Scope from '../scope';
import { LATEST, DEFAULT_LANE, Extensions } from '../../constants';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Source from '../models/source';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import CompsAndLanesObjects from '../comps-and-lanes-objects';
import LaneObjects from '../lane-objects';
import { buildOneGraphForComponentsAndMultipleVersions } from '../graph/components-graph';
import GeneralError from '../../error/general-error';
import replacePackageName from '../../utils/string/replace-package-name';
import { RemoteLaneId } from '../../lane-id/lane-id';

/**
 * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
 * saves a component into the objects directory of the remote scope, then, resolves its
 * dependencies, saves them as well. Finally runs the build process if needed on an isolated
 * environment.
 */
export async function exportManyBareScope(
  scope: Scope,
  componentsObjects: ComponentObjects[],
  clientIsOld: boolean,
  lanesObjects: LaneObjects[] = []
): Promise<BitIds> {
  const lanesObjectsTree = (lanesObjects || []).map((laneObj) => laneObj.toObjects());
  logger.debugAndAddBreadCrumb(
    'scope.exportManyBareScope',
    `Going to save ${componentsObjects.length} components, ${lanesObjects.length} lanes`
  );
  const manyObjects = componentsObjects.map((componentObjects) => componentObjects.toObjects());
  const mergedIds: BitIds = await mergeObjects(scope, manyObjects, lanesObjectsTree);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'will try to importMany in case there are missing dependencies');
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importMany(mergedIds, true, false); // resolve dependencies
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'successfully ran importMany');
  await scope.objects.persist();
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');
  // @todo: this is a temp workaround, remove once v15 is out
  if (clientIsOld) {
    const manyCompVersions = manyObjects.map((objects) => objects.component.toComponentVersion(LATEST));
    const bitIds = BitIds.fromArray(manyCompVersions.map((compVersion) => compVersion.id));
    logger.debug('exportManyBareScope: completed. exit.');
    return bitIds;
  }
  logger.debug('exportManyBareScope: completed. exit.');
  return mergedIds;
}

export async function exportMany({
  scope,
  ids,
  remoteName,
  context = {},
  includeDependencies = false, // kind of fork. by default dependencies only cached, with this, their scope-name is changed
  changeLocallyAlthoughRemoteIsDifferent = false, // by default only if remote stays the same the component is changed from staged to exported
  codemod = false,
  lanesObjects = [],
  allVersions,
  idsWithFutureScope,
}: {
  scope: Scope;
  ids: BitIds;
  remoteName: string | null | undefined;
  context?: Record<string, any>;
  includeDependencies: boolean;
  changeLocallyAlthoughRemoteIsDifferent: boolean;
  codemod: boolean;
  lanesObjects?: Lane[];
  allVersions: boolean;
  idsWithFutureScope: BitIds;
}): Promise<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }> {
  logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
  enrichContextFromGlobal(context);
  if (lanesObjects.length && !remoteName) {
    throw new Error('todo: implement export lanes to default scopes after tracking lanes local:remote is implemented');
  }
  if (includeDependencies) {
    const dependenciesIds = await getDependenciesImportIfNeeded();
    ids.push(...dependenciesIds);
    ids = BitIds.uniqFromArray(ids);
  }
  const remotes: Remotes = await getScopeRemotes(scope);
  if (remoteName) {
    logger.debugAndAddBreadCrumb('export-scope-components', 'export all ids to one remote');
    return exportIntoRemote(remoteName, ids, lanesObjects);
  }
  logger.debugAndAddBreadCrumb('export-scope-components', 'export ids to multiple remotes');
  const groupedByScope = await sortAndGroupByScope();
  const groupedByScopeString = groupedByScope
    .map((item) => `scope "${item.scopeName}": ${item.ids.toString()}`)
    .join(', ');
  logger.debug(`export-scope-components, export to the following scopes ${groupedByScopeString}`);
  const results = await pMapSeries(groupedByScope, (result) => exportIntoRemote(result.scopeName, result.ids));
  return {
    newIdsOnRemote: R.flatten(results.map((r) => r.newIdsOnRemote)),
    exported: BitIds.uniqFromArray(R.flatten(results.map((r) => r.exported))),
    updatedLocally: BitIds.uniqFromArray(R.flatten(results.map((r) => r.updatedLocally))),
  };

  async function exportIntoRemote(
    remoteNameStr: string,
    bitIds: BitIds,
    lanes: Lane[] = []
  ): Promise<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }> {
    bitIds.throwForDuplicationIgnoreVersion();
    const remote: Remote = await remotes.resolve(remoteNameStr, scope);
    const componentObjects = await pMapSeries(bitIds, (id) => scope.sources.getObjects(id));
    const idsToChangeLocally = BitIds.fromArray(
      bitIds.filter((id) => !id.scope || id.scope === remoteNameStr || changeLocallyAlthoughRemoteIsDifferent)
    );
    const idsAndObjectsP = lanes.map((laneObj) => laneObj.collectObjectsById(scope.objects));
    const idsAndObjects = R.flatten(await Promise.all(idsAndObjectsP));
    const componentsAndObjects: Array<{ component: ModelComponent; objects: BitObject[] }> = [];
    const processComponentObjects = async (componentObject: ComponentObjects) => {
      const componentAndObject = componentObject.toObjects();
      const localVersions = componentAndObject.component.getLocalVersions();
      idsAndObjects.forEach((idAndObjects) => {
        if (componentAndObject.component.toBitId().isEqual(idAndObjects.id)) {
          // @todo: remove duplication. check whether the same hash already exist, and don't push it.
          componentAndObject.objects.push(...idAndObjects.objects);
        }
      });
      componentAndObject.component.clearStateData();
      const didConvertScope = await convertToCorrectScope(
        scope,
        componentAndObject,
        remoteNameStr,
        includeDependencies,
        bitIds,
        codemod
      );
      const remoteObj = { url: remote.host, name: remote.name, date: Date.now().toString() };
      componentAndObject.component.addScopeListItem(remoteObj);

      if (idsToChangeLocally.hasWithoutScopeAndVersion(componentAndObject.component.toBitId())) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObject);
      } else {
        // the component should not be changed locally. only add the new scope to the scope-list
        const componentAndObjectCloned = componentObject.toObjects();
        componentAndObjectCloned.component.addScopeListItem(remoteObj);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObjectCloned);
      }

      const componentBuffer = await componentAndObject.component.compress();
      const getObjectsBuffer = () => {
        // @todo currently, for lanes (componentAndObject.component.head) this optimization is skipped.
        // it should be enabled with a different mechanism
        if (
          allVersions ||
          includeDependencies ||
          didConvertScope ||
          componentAndObject.component.head ||
          lanes.length
        ) {
          // only when really needed (e.g. fork or version changes), collect all versions objects
          return Promise.all(componentAndObject.objects.map((obj) => obj.compress()));
        }
        // when possible prefer collecting only new/local versions. the server has already
        // the rest, so no point of sending them.
        return componentAndObject.component.collectVersionsObjects(scope.objects, localVersions);
      };
      const objectsBuffer = await getObjectsBuffer();
      return new ComponentObjects(componentBuffer, objectsBuffer);
    };
    // don't use Promise.all, otherwise, it'll throw "JavaScript heap out of memory" on a large set of data
    const manyObjects: ComponentObjects[] = await pMapSeries(componentObjects, processComponentObjects);
    const manyLanesObjects = await Promise.all(
      lanes.map(async (lane) => {
        lane.components.forEach((c) => {
          c.id = c.id.changeScope(remoteName);
        });
        const laneBuffer = await lane.compress();
        return new LaneObjects(laneBuffer, []);
      })
    );
    const compsAndLanesObjects = new CompsAndLanesObjects(manyObjects, manyLanesObjects);
    let exportedIds: string[];
    try {
      exportedIds = await remote.pushMany(compsAndLanesObjects, context);
      logger.debugAndAddBreadCrumb(
        'exportMany',
        'successfully pushed all ids to the bare-scope, going to save them back to local scope'
      );
    } catch (err) {
      logger.warnAndAddBreadCrumb('exportMany', 'failed pushing ids to the bare-scope');
      return Promise.reject(err);
    }
    await Promise.all(idsToChangeLocally.map((id) => scope.sources.removeComponentById(id)));
    // @ts-ignore
    idsToChangeLocally.forEach((id) => scope.createSymlink(id, remoteNameStr));
    componentsAndObjects.forEach((componentObject) => scope.sources.put(componentObject));

    // update lanes
    await Promise.all(
      lanes.map(async (lane) => {
        if (idsToChangeLocally.length) {
          // otherwise, we don't want to update scope-name of components in the lane object
          scope.objects.add(lane);
          // this is needed so later on we can add the tracking data and update .bitmap
          // @todo: support having a different name on the remote by a flag
          lane.remoteLaneId = RemoteLaneId.from(lane.name, remoteNameStr);
        }
        await scope.objects.remoteLanes.syncWithLaneObject(remoteNameStr, lane);
      })
    );
    const currentLane = scope.lanes.getCurrentLaneName();
    if (currentLane === DEFAULT_LANE && !lanes.length) {
      // all exported from master
      const remoteLaneId = RemoteLaneId.from(DEFAULT_LANE, remoteNameStr);
      await scope.objects.remoteLanes.loadRemoteLane(remoteLaneId);
      componentsAndObjects.forEach(({ component }) => {
        scope.objects.remoteLanes.addEntry(remoteLaneId, component.toBitId(), component.getHead());
      });
    }

    await scope.objects.persist();
    const newIdsOnRemote = exportedIds.map((id) => BitId.parse(id, true));
    // remove version. exported component might have multiple versions exported
    const idsWithRemoteScope: BitId[] = newIdsOnRemote.map((id) => id.changeVersion(undefined));
    const idsWithRemoteScopeUniq = BitIds.uniqFromArray(idsWithRemoteScope);
    return {
      newIdsOnRemote,
      exported: idsWithRemoteScopeUniq,
      updatedLocally: BitIds.fromArray(
        idsWithRemoteScopeUniq.filter((id) => idsToChangeLocally.hasWithoutScopeAndVersion(id))
      ),
    };
  }

  /**
   * the topological sort is needed in case components have dependencies in other scopes.
   * without sorting, in case remoteA/compA depends on remoteB/compB and remoteA/compA was exported
   * first, remoteA will throw an error that remoteB/compB was not found.
   * sorting the components topologically, ensure we export remoteB/compB first.
   *
   * there are a few cases to consider:
   * 1) in case there are cycle dependencies between the scopes, it's impossible to toposort.
   * 2) the cycle dependencies can be between different versions. e.g. remoteA/compA@0.0.1 requires
   * remoteB/compB@0.0.1 and remoteB/compB@0.0.2 requires remoteA/compA@0.0.2.
   * that's why when building the graph we take all versions into account and build the graph
   * without the version number, so then we could let the graph's algorithm finding the cycle.
   * 3) it's possible to have circle dependencies inside the same scope, and non-circle
   * dependencies between the different scopes. in this case, the toposort should be done after
   * removing the ids participated in the circular.
   *
   * once the sort is done, it returns an array of { scopeName: string; ids: BitIds }.
   * keep in mind that this array might have multiple items with the same scopeName, that's totally
   * valid and it will cause multiple round-trip to the same scope. there is no other way around
   * it.
   * the sort is done after eliminating circles, so it's possible to execute topsort. once the
   * components are topological sorted, they are added one by one to the results array. If the last
   * item in the array has the same scope as the currently inserted component, it can be added to
   * the same scope group. otherwise, a new item needs to be added to the array with the new scope.
   */
  async function sortAndGroupByScope(): Promise<{ scopeName: string; ids: BitIds }[]> {
    const grouped = ids.toGroupByScopeName(idsWithFutureScope);
    const groupedArrayFormat = Object.keys(grouped).map((scopeName) => ({ scopeName, ids: grouped[scopeName] }));
    if (Object.keys(grouped).length <= 1) {
      return groupedArrayFormat;
    }
    // when exporting to multiple scopes, there is a chance of dependencies between the different scopes
    const componentsAndVersions = await scope.getComponentsAndAllLocalUnexportedVersions(ids);
    const graph: Graph = buildOneGraphForComponentsAndMultipleVersions(componentsAndVersions);
    const cycles = graphLib.alg.findCycles(graph);
    const groupedArraySorted: { scopeName: string; ids: BitIds }[] = [];
    const addToGroupedSorted = (id: BitId) => {
      if (groupedArraySorted.length) {
        const lastItem = groupedArraySorted[groupedArraySorted.length - 1];
        if (lastItem.scopeName === id.scope) {
          lastItem.ids.push(id);
          return;
        }
      }
      const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(id);
      if (idWithFutureScope) {
        groupedArraySorted.push({ scopeName: idWithFutureScope.scope as string, ids: new BitIds(id) });
      }
      // otherwise, it's in the graph, but not in the idWithFutureScope array. this is probably just a
      // dependency of one of the pending-export ids, and that dependency is not supposed to be
      // export, so just ignore it.
    };
    if (cycles.length) {
      const cyclesWithMultipleScopes = cycles.filter((cycle) => {
        const bitIds = cycle.map((s) => graph.node(s));
        const firstScope = bitIds[0].scope;
        return bitIds.some((id) => id.scope !== firstScope);
      });
      if (cyclesWithMultipleScopes.length) {
        throw new GeneralError(`fatal: unable to export. the following components have circular dependencies between two or more scopes
${cyclesWithMultipleScopes.map((c) => c.join(', ')).join('\n')}
please untag the problematic components and eliminate the circle between the scopes.
tip: use "bit graph [--all-versions]" to get a visual look of the circular dependencies`);
      }
      // there are circles but they are all from the same scope, add them to groupedArraySorted
      // first, then, remove from the graph, so it will be possible to execute topsort
      cycles.forEach((cycle) => {
        cycle.forEach((node) => {
          const id = graph.node(node);
          addToGroupedSorted(id);
          graph.removeNode(node);
        });
      });
    }
    // @todo: optimize in case each one of the ids has all its dependencies from the same scope,
    // return groupedArrayFormat
    let sortedComponents;
    try {
      sortedComponents = graphLib.alg.topsort(graph);
    } catch (err) {
      // should never arrive here, it's just a precaution, as topsort doesn't fail nicely
      logger.error(err);
      throw new Error(`fatal: graphlib was unable to topsort the components. circles: ${cycles}`);
    }
    const sortedComponentsIds = sortedComponents.map((s) => graph.node(s)).reverse();
    sortedComponentsIds.forEach((id) => addToGroupedSorted(id));

    return groupedArraySorted;
  }

  async function getDependenciesImportIfNeeded(): Promise<BitId[]> {
    const scopeComponentImporter = new ScopeComponentsImporter(scope);
    const versionsDependencies = await scopeComponentImporter.importManyWithAllVersions(ids, true, true);
    const allDependencies = R.flatten(
      versionsDependencies.map((versionDependencies) => versionDependencies.allDependencies)
    );
    return allDependencies.map((componentVersion) => componentVersion.component.toBitId());
  }
}

/**
 * merge components into the scope.
 *
 * a component might have multiple versions that some where merged and some were not.
 * the BitIds returned here includes the versions that were merged. so it could contain multiple
 * ids of the same component with different versions
 */
async function mergeObjects(scope: Scope, manyObjects: ComponentTree[], lanesObjects: LaneTree[]): Promise<BitIds> {
  const mergeResults = await Promise.all(
    manyObjects.map(async (objects) => {
      try {
        const result = await scope.sources.merge(objects, true, false);
        return result;
      } catch (err) {
        if (err instanceof MergeConflict || err instanceof ComponentNeedsUpdate) {
          return err; // don't throw. instead, get all components with merge-conflicts
        }
        throw err;
      }
    })
  );
  const mergeLaneResultsP = lanesObjects.map((laneObjects) => scope.sources.mergeLane(laneObjects, false));
  const mergeLaneResults = R.flatten(await Promise.all(mergeLaneResultsP));
  const componentsWithConflicts = mergeResults.filter((result) => result instanceof MergeConflict);
  const componentsNeedUpdate = [
    ...mergeResults.filter((result) => result instanceof ComponentNeedsUpdate),
    ...mergeLaneResults.filter((result) => result instanceof ComponentNeedsUpdate),
  ];
  if (componentsWithConflicts.length || componentsNeedUpdate.length) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const idsAndVersions = componentsWithConflicts.map((c) => ({ id: c.id, versions: c.versions }));
    const idsAndVersionsWithConflicts = R.sortBy(R.prop('id'), idsAndVersions);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const idsOfNeedUpdateComps = R.sortBy(
      R.prop('id'),
      componentsNeedUpdate.map((c) => ({ id: c.id, lane: c.lane }))
    );
    throw new MergeConflictOnRemote(idsAndVersionsWithConflicts, idsOfNeedUpdateComps);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const mergedLanesComponents = mergeLaneResults.filter(({ mergedVersions }) => mergedVersions.length);
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map((version) => mergedComponent.toBitId().changeVersion(version));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return BitIds.fromArray(R.flatten([...mergedComponents, ...mergedLanesComponents].map(getMergedIds)));
}

/**
 * Component and dependencies id changes:
 * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
 * a result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
 * to the bare-scope name.
 * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
 *
 * Dist code changes:
 * see https://github.com/teambit/bit/issues/1770 for complete info
 * some compilers require the links to be part of the bundle, change the component name in these
 * files from the id without scope to the id with the scope
 * e.g. `@bit/utils.is-string` becomes `@bit/scope-name.utils.is-string`.
 * these files changes need to be done regardless the "--rewire" flag.
 *
 * Source code changes (codemod):
 * when "--rewire" flag is used, import/require statement should be changed from the old scope-name
 * to the new scope-name. Or from no-scope to the new scope.
 */
async function convertToCorrectScope(
  scope: Scope,
  componentsObjects: { component: ModelComponent; objects: BitObject[] },
  remoteScope: string,
  fork: boolean,
  exportingIds: BitIds,
  codemod: boolean
): Promise<boolean> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const versionsObjects: Version[] = componentsObjects.objects.filter((object) => object instanceof Version);
  const haveVersionsChanged = await Promise.all(
    versionsObjects.map(async (objectVersion: Version) => {
      const hashBefore = objectVersion.hash().toString();
      const didCodeMod = await _replaceSrcOfVersionIfNeeded(objectVersion);
      const didDependencyChange = changeDependencyScope(objectVersion);
      changeExtensionsScope(objectVersion);
      // @todo: after v15 is deployed, remove the following code until the next "// END" comment.
      // this is currently needed because remote-servers with older code still saving Version
      // objects into the calculated hash path and not into the originally created hash.
      // in this scenario, the calculated hash is different than the original hash due to the scope
      // changes. if we don't do this hash replacement, these remote servers will write the version
      // objects into different paths and then throw an error of component-not-found due to failure
      // finding the Version objects on the fs.
      const hashAfter = objectVersion.calculateHash().toString();
      const isTag = componentsObjects.component.getTagOfRefIfExists(objectVersion.hash());
      if (isTag && hashBefore !== hashAfter) {
        if (!didCodeMod && !didDependencyChange) {
          throw new Error('hash should not be changed if there was not any dependency scope changes nor codemod');
        }
        objectVersion._hash = hashAfter;
        logger.debugAndAddBreadCrumb(
          'scope._convertToCorrectScope',
          `switching {id} version hash from ${hashBefore} to ${hashAfter}`,
          { id: componentsObjects.component.id().toString() }
        );
        const versions = componentsObjects.component.versions;
        Object.keys(versions).forEach((version) => {
          if (versions[version].toString() === hashBefore) {
            versions[version] = Ref.from(hashAfter);
          }
        });
        if (componentsObjects.component.getHeadStr() === hashBefore) {
          componentsObjects.component.setHead(Ref.from(hashAfter));
        }
        versionsObjects.forEach((versionObj) => {
          versionObj.parents = versionObj.parents.map((parent) => {
            if (parent.toString() === hashBefore) return Ref.from(hashAfter);
            return parent;
          });
        });
      }
      // END DELETION OF BIT > v15.
      return didCodeMod || didDependencyChange;
    })
  );
  const hasComponentChanged = remoteScope !== componentsObjects.component.scope;
  componentsObjects.component.scope = remoteScope;

  // return true if one of the versions has changed or the component itself
  return haveVersionsChanged.some((x) => x) || hasComponentChanged;

  function changeDependencyScope(version: Version): boolean {
    let hasChanged = false;
    version.getAllDependencies().forEach((dependency) => {
      const updatedScope = getIdWithUpdatedScope(dependency.id);
      if (!updatedScope.isEqual(dependency.id)) {
        hasChanged = true;
        dependency.id = updatedScope;
      }
    });
    const flattenedFields = ['flattenedDependencies', 'flattenedDevDependencies'];
    flattenedFields.forEach((flattenedField) => {
      const ids: BitIds = version[flattenedField];
      const needsChange = ids.some((id) => id.scope !== remoteScope);
      if (needsChange) {
        version[flattenedField] = getBitIdsWithUpdatedScope(ids);
        hasChanged = true;
      }
    });
    return hasChanged;
  }

  function changeExtensionsScope(version: Version): boolean {
    let hasChanged = false;
    version.extensions.forEach((ext) => {
      if (ext.extensionId) {
        const updatedScope = getIdWithUpdatedScope(ext.extensionId);
        if (!updatedScope.isEqual(ext.extensionId)) {
          hasChanged = true;
          ext.extensionId = updatedScope;
        }
      }
      if (ext.name === Extensions.dependencyResolver && ext.data && ext.data.dependencies) {
        ext.data.dependencies.forEach((dep) => {
          const id = new BitId(dep.componentId);
          const updatedScope = getIdWithUpdatedScope(id);
          if (!updatedScope.isEqual(id)) {
            hasChanged = true;
            dep.componentId = updatedScope;
          }
        });
      }
    });
    return hasChanged;
  }

  function getIdWithUpdatedScope(dependencyId: BitId): BitId {
    if (dependencyId.scope === remoteScope) {
      return dependencyId; // nothing has changed
    }
    if (!dependencyId.scope || fork || exportingIds.hasWithoutVersion(dependencyId)) {
      const depId = ModelComponent.fromBitId(dependencyId);
      // todo: use 'load' for async and switch the foreach with map.
      const dependencyObject = scope.objects.loadSync(depId.hash());
      if (dependencyObject instanceof Symlink) {
        return dependencyId.changeScope(dependencyObject.realScope);
      }
      return dependencyId.changeScope(remoteScope);
    }
    return dependencyId;
  }
  function getBitIdsWithUpdatedScope(bitIds: BitIds): BitIds {
    const updatedIds = bitIds.map((id) => getIdWithUpdatedScope(id));
    return BitIds.fromArray(updatedIds);
  }
  async function _replaceSrcOfVersionIfNeeded(version: Version): Promise<boolean> {
    let hasVersionChanged = false;
    const processFile = async (file, isDist: boolean) => {
      const newFileObject = await _createNewFileIfNeeded(version, file, isDist);
      if (newFileObject && (codemod || isDist)) {
        file.file = newFileObject.hash();
        componentsObjects.objects.push(newFileObject);
        hasVersionChanged = true;
      }
      return null;
    };
    await Promise.all(version.files.map((file) => processFile(file, false)));
    await Promise.all((version.dists || []).map((file) => processFile(file, true)));
    return hasVersionChanged;
  }
  /**
   * in the following cases it is needed to change files content:
   * 1. fork. exporting components of scope-a to scope-b. requirement: 1) --rewire flag. 2) id must have scope.
   * 2. dists. changing no-scope to current scope. requirement: 1) id should not have scope.
   * 3. no-scope. changing src no-scope to current scope. requirement: 1) --rewire flag. 2) id should not have scope.
   *
   * according to these three. if --rewire was not used and id has scope, no need to do anything.
   *
   * in the following conditions the process should stop and ask for --rewire flag:
   * 1. --rewire flag was not entered.
   * 2. id does not have scope.
   * 3. the file is not a dist file.
   * 4. the file content has pkg name without scope-name.
   */
  async function _createNewFileIfNeeded(
    version: Version,
    file: Record<string, any>,
    isDist: boolean
  ): Promise<Source | null | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentHash = file.file;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fileObject: Source = await scope.objects.load(currentHash);
    const fileString = fileObject.contents.toString();
    const dependenciesIds = version.getAllDependencies().map((d) => d.id);
    const componentId = componentsObjects.component.toBitId();
    const allIds = [...dependenciesIds, componentId];
    let newFileString = fileString;
    allIds.forEach((id) => {
      if (id.scope === remoteScope) {
        return; // nothing to do, the remote has not changed
      }
      const idWithNewScope = id.changeScope(remoteScope);
      const pkgNameWithOldScope = componentIdToPackageName({
        id,
        bindingPrefix: componentsObjects.component.bindingPrefix,
        extensions: version.extensions,
      });
      if (!codemod) {
        // use did not enter --rewire flag
        if (id.hasScope()) {
          return; // because only --rewire is permitted to change from scope-a to scope-b.
        }
        // dists can change no-scope to scope without --rewire flag. if this is not a dist file
        // and the file needs to change from no-scope to scope, it needs to --rewire flag.
        // for non-legacy the no-scope is not possible, so no need to check for it.
        if (!isDist && fileString.includes(pkgNameWithOldScope) && version.isLegacy) {
          throw new GeneralError(`please use "--rewire" flag to fix the import/require statements "${pkgNameWithOldScope}" in "${
            file.relativePath
          }" file of ${componentId.toString()},
the current import/require module has no scope-name, which result in an invalid module path upon import`);
        }
      }
      // at this stage, we know that either 1) --rewire was used. 2) it's dist and id doesn't have scope-name
      // in both cases, if the file has the old package-name, it should be replaced to the new one.
      const pkgNameWithNewScope = componentIdToPackageName({
        id: idWithNewScope,
        bindingPrefix: componentsObjects.component.bindingPrefix,
        extensions: version.extensions,
      });
      // replace old scope to a new scope (e.g. '@bit/old-scope.is-string' => '@bit/new-scope.is-string')
      // or no-scope to a new scope. (e.g. '@bit/is-string' => '@bit/new-scope.is-string')
      newFileString = replacePackageName(newFileString, pkgNameWithOldScope, pkgNameWithNewScope);
    });
    if (newFileString !== fileString) {
      return Source.from(Buffer.from(newFileString));
    }
    return null;
  }
}
