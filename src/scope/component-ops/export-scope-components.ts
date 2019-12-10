import graphLib, { Graph } from 'graphlib';
import R from 'ramda';
import pMapSeries from 'p-map-series';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { MergeConflictOnRemote, MergeConflict } from '../exceptions';
import ComponentObjects from '../component-objects';
import { ComponentTree } from '../repositories/sources';
import { Ref, BitObject } from '../objects';
import { ModelComponent, Symlink, Version } from '../models';
import { getScopeRemotes } from '../scope-remotes';
import ScopeComponentsImporter from './scope-components-importer';
import { Remotes, Remote } from '../../remotes';
import Scope from '../scope';
import { LATEST } from '../../constants';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Source from '../models/source';
import { buildOneGraphForComponentsAndMultipleVersions } from '../graph/components-graph';
import GeneralError from '../../error/general-error';
import replacePackageName from '../../utils/string/replace-package-name';

/**
 * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
 * saves a component into the objects directory of the remote scope, then, resolves its
 * dependencies, saves them as well. Finally runs the build process if needed on an isolated
 * environment.
 */
export async function exportManyBareScope(
  scope: Scope,
  componentsObjects: ComponentObjects[],
  clientIsOld: boolean
): Promise<BitIds> {
  logger.debugAndAddBreadCrumb('scope.exportManyBareScope', `Going to save ${componentsObjects.length} components`);
  const manyObjects = componentsObjects.map(componentObjects => componentObjects.toObjects(scope.objects));
  const mergedIds: BitIds = await mergeObjects(scope, manyObjects);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'will try to importMany in case there are missing dependencies');
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importMany(mergedIds, true, false); // resolve dependencies
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'successfully ran importMany');
  await scope.objects.persist();
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');
  // @todo: this is a temp workaround, remove once v15 is out
  if (clientIsOld) {
    const manyCompVersions = manyObjects.map(objects => objects.component.toComponentVersion(LATEST));
    const bitIds = BitIds.fromArray(manyCompVersions.map(compVersion => compVersion.id));
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
  defaultScope
}: {
  scope: Scope;
  ids: BitIds;
  remoteName: string | null | undefined;
  context?: Record<string, any>;
  includeDependencies: boolean;
  changeLocallyAlthoughRemoteIsDifferent: boolean;
  codemod: boolean;
  defaultScope: string | null | undefined;
}): Promise<{ exported: BitIds; updatedLocally: BitIds }> {
  logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
  enrichContextFromGlobal(context);
  if (includeDependencies) {
    const dependenciesIds = await getDependenciesImportIfNeeded();
    ids.push(...dependenciesIds);
    ids = BitIds.uniqFromArray(ids);
  }
  const remotes: Remotes = await getScopeRemotes(scope);
  if (remoteName) {
    return exportIntoRemote(remoteName, ids);
  }
  const groupedByScope = await sortAndGroupByScope();
  const results = await pMapSeries(groupedByScope, result => exportIntoRemote(result.scopeName, result.ids));
  return {
    exported: BitIds.uniqFromArray(R.flatten(results.map(r => r.exported))),
    updatedLocally: BitIds.uniqFromArray(R.flatten(results.map(r => r.updatedLocally)))
  };

  async function exportIntoRemote(
    remoteNameStr: string,
    bitIds: BitIds
  ): Promise<{ exported: BitIds; updatedLocally: BitIds }> {
    const remote: Remote = await remotes.resolve(remoteNameStr, scope);
    const componentObjects = await pMapSeries(bitIds, id => scope.sources.getObjects(id));
    const idsToChangeLocally = BitIds.fromArray(
      bitIds.filter(id => !id.scope || id.scope === remoteNameStr || changeLocallyAlthoughRemoteIsDifferent)
    );
    const componentsAndObjects = [];
    const manyObjectsP = componentObjects.map(async (componentObject: ComponentObjects) => {
      const componentAndObject = componentObject.toObjects(scope.objects);
      componentAndObject.component.clearStateData();
      await convertToCorrectScope(scope, componentAndObject, remoteNameStr, includeDependencies, bitIds, codemod);
      await changePartialNamesToFullNamesInDists(scope, componentAndObject.component, componentAndObject.objects);
      const remoteObj = { url: remote.host, name: remote.name, date: Date.now().toString() };
      componentAndObject.component.addScopeListItem(remoteObj);

      if (idsToChangeLocally.hasWithoutScopeAndVersion(componentAndObject.component.toBitId())) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObject);
      } else {
        // the component should not be changed locally. only add the new scope to the scope-list
        const componentAndObjectCloned = componentObject.toObjects(scope.objects);
        componentAndObjectCloned.component.addScopeListItem(remoteObj);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObjectCloned);
      }
      const componentBuffer = await componentAndObject.component.compress();
      const objectsBuffer = await Promise.all(componentAndObject.objects.map(obj => obj.compress()));
      return new ComponentObjects(componentBuffer, objectsBuffer);
    });
    const manyObjects: ComponentObjects[] = await Promise.all(manyObjectsP);
    let exportedIds: string[];
    try {
      exportedIds = await remote.pushMany(manyObjects, context);
      logger.debugAndAddBreadCrumb(
        'exportMany',
        'successfully pushed all ids to the bare-scope, going to save them back to local scope'
      );
    } catch (err) {
      logger.warnAndAddBreadCrumb('exportMany', 'failed pushing ids to the bare-scope');
      return Promise.reject(err);
    }
    await Promise.all(idsToChangeLocally.map(id => scope.sources.removeComponentById(id)));
    // @ts-ignore
    idsToChangeLocally.forEach(id => scope.createSymlink(id, remoteNameStr));
    componentsAndObjects.forEach(componentObject => scope.sources.put(componentObject));
    await scope.objects.persist();
    // remove version. exported component might have multiple versions exported
    const idsWithRemoteScope: BitId[] = exportedIds.map(id => BitId.parse(id, true).changeVersion(null));
    const idsWithRemoteScopeUniq = BitIds.uniqFromArray(idsWithRemoteScope);
    return {
      exported: idsWithRemoteScopeUniq,
      updatedLocally: BitIds.fromArray(
        idsWithRemoteScopeUniq.filter(id => idsToChangeLocally.hasWithoutScopeAndVersion(id))
      )
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
   */
  async function sortAndGroupByScope(): Promise<{ scopeName: string; ids: BitIds }[]> {
    const grouped = ids.toGroupByScopeName(defaultScope);
    const groupedArrayFormat = Object.keys(grouped).map(scopeName => ({ scopeName, ids: grouped[scopeName] }));
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
      groupedArraySorted.push({ scopeName: id.scope || (defaultScope as string), ids: new BitIds(id) });
    };
    if (cycles.length) {
      const cyclesWithMultipleScopes = cycles.filter(cycle => {
        const bitIds = cycle.map(s => graph.node(s));
        const firstScope = bitIds[0].scope;
        return bitIds.some(id => id.scope !== firstScope);
      });
      if (cyclesWithMultipleScopes.length) {
        throw new GeneralError(`fatal: unable to export. the following components have circular dependencies between two or more scopes
${cyclesWithMultipleScopes.map(c => c.join(', ')).join('\n')}
please untag the problematic components and eliminate the circle between the scopes.
tip: use "bit graph [--all-versions]" to get a visual look of the circular dependencies`);
      }
      // there are circles but they are all from the same scope, add them to groupedArraySorted
      // first, then, remove from the graph, so it will be possible to execute topsort
      cycles.forEach(cycle => {
        cycle.forEach(node => {
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
    const sortedComponentsIds = sortedComponents.map(s => graph.node(s)).reverse();
    sortedComponentsIds.forEach(id => addToGroupedSorted(id));

    return groupedArraySorted;
  }

  async function getDependenciesImportIfNeeded(): Promise<BitId[]> {
    const scopeComponentImporter = new ScopeComponentsImporter(scope);
    const versionsDependencies = await scopeComponentImporter.importManyWithAllVersions(ids, true, true);
    const allDependencies = R.flatten(
      versionsDependencies.map(versionDependencies => versionDependencies.allDependencies)
    );
    return allDependencies.map(componentVersion => componentVersion.component.toBitId());
  }
}

/**
 * merge components into the scope.
 *
 * a component might have multiple versions that some where merged and some were not.
 * the BitIds returned here includes the versions that were merged. so it could contain multiple
 * ids of the same component with different versions
 */
async function mergeObjects(scope: Scope, manyObjects: ComponentTree[]): Promise<BitIds> {
  const mergeResults = await Promise.all(
    manyObjects.map(async objects => {
      try {
        const result = await scope.sources.merge(objects, true, false);
        return result;
      } catch (err) {
        if (err instanceof MergeConflict) {
          return err; // don't throw. instead, get all components with merge-conflicts
        }
        throw err;
      }
    })
  );
  const componentsWithConflicts = mergeResults.filter(result => result instanceof MergeConflict);
  if (componentsWithConflicts.length) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const idsAndVersions = componentsWithConflicts.map(c => ({ id: c.id, versions: c.versions }));
    // sort to have a consistent error message
    const idsAndVersionsSorted = R.sortBy(R.prop('id'), idsAndVersions);
    throw new MergeConflictOnRemote(idsAndVersionsSorted);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map(version => mergedComponent.toBitId().changeVersion(version));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return BitIds.fromArray(R.flatten(mergedComponents.map(getMergedIds)));
}

/**
 * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
 * a result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
 * to the bare-scope name.
 * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
 */
async function convertToCorrectScope(
  scope: Scope,
  componentsObjects: { component: ModelComponent; objects: BitObject[] },
  remoteScope: string,
  fork: boolean,
  exportingIds: BitIds,
  codemod: boolean
): Promise<void> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const versionsObjects: Version[] = componentsObjects.objects.filter(object => object instanceof Version);
  await Promise.all(
    versionsObjects.map(async (objectVersion: Version) => {
      const hashBefore = objectVersion.hash().toString();
      if (codemod) await _replaceSrcOfVersionIfNeeded(objectVersion);
      changeDependencyScope(objectVersion);
      const hashAfter = objectVersion.hash().toString();
      if (hashBefore !== hashAfter) {
        logger.debugAndAddBreadCrumb(
          'scope._convertToCorrectScope',
          `switching {id} version hash from ${hashBefore} to ${hashAfter}`,
          { id: componentsObjects.component.id().toString() }
        );
        const versions = componentsObjects.component.versions;
        Object.keys(versions).forEach(version => {
          if (versions[version].toString() === hashBefore) {
            versions[version] = Ref.from(hashAfter);
          }
        });
      }
    })
  );
  componentsObjects.component.scope = remoteScope;

  function changeDependencyScope(version: Version): void {
    version.getAllDependencies().forEach(dependency => {
      dependency.id = getIdWithUpdatedScope(dependency.id);
    });
    version.flattenedDependencies = getBitIdsWithUpdatedScope(version.flattenedDependencies);
    version.flattenedDevDependencies = getBitIdsWithUpdatedScope(version.flattenedDevDependencies);
    version.flattenedCompilerDependencies = getBitIdsWithUpdatedScope(version.flattenedCompilerDependencies);
    version.flattenedTesterDependencies = getBitIdsWithUpdatedScope(version.flattenedTesterDependencies);
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
    const updatedIds = bitIds.map(id => getIdWithUpdatedScope(id));
    return BitIds.fromArray(updatedIds);
  }
  async function _replaceSrcOfVersionIfNeeded(version: Version) {
    const files = [...version.files, ...(version.dists || [])];
    await Promise.all(
      files.map(async file => {
        const newFileObject = await _createNewFileIfNeeded(version, file);
        if (newFileObject) {
          file.file = newFileObject.hash();
          componentsObjects.objects.push(newFileObject);
        }
        return null;
      })
    );
  }
  async function _createNewFileIfNeeded(
    version: Version,
    file: Record<string, any>
  ): Promise<Source | null | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentHash = file.file;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fileObject: Source = await scope.objects.load(currentHash);
    const fileString = fileObject.contents.toString();
    const dependenciesIds = version.getAllDependencies().map(d => d.id);
    const allIds = [...dependenciesIds, componentsObjects.component.toBitId()];
    let newFileString = fileString;
    allIds.forEach(id => {
      if (id.scope === remoteScope) {
        return; // nothing to do, the remote has not changed
      }
      const idWithNewScope = id.changeScope(remoteScope);
      const pkgNameWithNewScope = componentIdToPackageName(idWithNewScope, componentsObjects.component.bindingPrefix);
      const pkgNameWithOldScope = componentIdToPackageName(id, componentsObjects.component.bindingPrefix);
      // replace an exact match. (e.g. '@bit/old-scope.is-string' => '@bit/new-scope.is-string')
      // the require/import statement might be to an internal path (e.g. '@bit/david.utils/is-string/internal-file')
      newFileString = replacePackageName(newFileString, pkgNameWithOldScope, pkgNameWithNewScope);
    });
    if (newFileString !== fileString) {
      return Source.from(Buffer.from(newFileString));
    }
    return null;
  }
}

/**
 * see https://github.com/teambit/bit/issues/1770 for complete info
 * some compilers require the links to be part of the bundle, change the component name in these
 * files from the id without scope to the id with the scope
 * e.g. `@bit/utils.is-string` becomes `@bit/scope-name.utils.is-string`
 */
async function changePartialNamesToFullNamesInDists(
  scope: Scope,
  component: ModelComponent,
  objects: BitObject[]
): Promise<void> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const versions: Version[] = objects.filter(object => object instanceof Version);
  await Promise.all(versions.map(version => _replaceDistsOfVersionIfNeeded(version)));

  async function _replaceDistsOfVersionIfNeeded(version: Version) {
    const dists = version.dists;
    if (!dists) return;
    await Promise.all(
      dists.map(async dist => {
        const newDistObject = await _createNewDistIfNeeded(version, dist);
        if (newDistObject) {
          dist.file = newDistObject.hash();
          objects.push(newDistObject);
        }
        return null;
      })
    );
  }

  async function _createNewDistIfNeeded(
    version: Version,
    dist: Record<string, any>
  ): Promise<Source | null | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentHash = dist.file;
    // if a dist file has changed as a result of codemod, it's not on the fs yet, so we fallback
    // to load from the objects it was pushed before. it'd be better to have more efficient mechanism.
    // currently, we require calculating the hash for each one of the source every time.
    const distObject: Source =
      (await currentHash.load(scope.objects)) ||
      objects.filter(obj => obj instanceof Source).find(obj => obj.hash().toString() === currentHash.toString());
    const distString = distObject.contents.toString();
    const dependenciesIds = version.getAllDependencies().map(d => d.id);
    const allIds = [...dependenciesIds, component.toBitId()];
    let newDistString = distString;
    allIds.forEach(id => {
      const idWithoutScope = id.changeScope(null);
      const pkgNameWithoutScope = componentIdToPackageName(idWithoutScope, component.bindingPrefix);
      const pkgNameWithScope = componentIdToPackageName(id, component.bindingPrefix);
      // replace an exact match. (e.g. '@bit/is-string' => '@bit/david.utils/is-string')
      // the require/import statement might be to an internal path (e.g. '@bit/david.utils/is-string/internal-file')
      newDistString = replacePackageName(newDistString, pkgNameWithoutScope, pkgNameWithScope);
    });
    if (newDistString !== distString) {
      return Source.from(Buffer.from(newDistString));
    }
    return null;
  }
}
