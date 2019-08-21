// @flow
import R from 'ramda';
import pMapSeries from 'p-map-series';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { MergeConflictOnRemote, MergeConflict } from '../exceptions';
import ComponentObjects from '../component-objects';
import type { ComponentTree } from '../repositories/sources';
import { Ref, BitObject } from '../objects';
import { ModelComponent, Symlink, Version } from '../models';
import { getScopeRemotes } from '../scope-remotes';
import ScopeComponentsImporter from './scope-components-importer';
import type { Remotes, Remote } from '../../remotes';
import type Scope from '../scope';
import { LATEST } from '../../constants';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Source from '../models/source';

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

export async function exportMany(scope: Scope, ids: BitIds, remoteName: string, context: Object = {}): Promise<BitIds> {
  logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
  const remotes: Remotes = await getScopeRemotes(scope);
  const remote: Remote = await remotes.resolve(remoteName, scope);
  const componentObjects = await pMapSeries(ids, id => scope.sources.getObjects(id));
  const componentsAndObjects = [];
  enrichContextFromGlobal(context);
  const manyObjectsP = componentObjects.map(async (componentObject: ComponentObjects) => {
    const componentAndObject = componentObject.toObjects(scope.objects);
    componentAndObject.component.clearStateData();
    convertNonScopeToCorrectScope(scope, componentAndObject, remoteName);
    await changePartialNamesToFullNamesInDists(scope, componentAndObject.component, componentAndObject.objects);
    componentsAndObjects.push(componentAndObject);
    const componentBuffer = await componentAndObject.component.compress();
    const objectsBuffer = await Promise.all(componentAndObject.objects.map(obj => obj.compress()));
    return new ComponentObjects(componentBuffer, objectsBuffer);
  });
  const manyObjects: ComponentObjects[] = await Promise.all(manyObjectsP);
  let exportedIds;
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
  await Promise.all(ids.map(id => scope.sources.removeComponentById(id)));
  ids.map(id => scope.createSymlink(id, remoteName));
  componentsAndObjects.map(componentObject => scope.sources.put(componentObject));
  await scope.objects.persist();
  // remove version. exported component might have multiple versions exported
  const idsWithRemoteScope = exportedIds.map(id => BitId.parse(id, true).changeVersion(null));
  return BitIds.uniqFromArray(idsWithRemoteScope);
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
    manyObjects.map(async (objects) => {
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
    const idsAndVersions = componentsWithConflicts.map(c => ({ id: c.id, versions: c.versions }));
    // sort to have a consistent error message
    const idsAndVersionsSorted = R.sortBy(R.prop('id'), idsAndVersions);
    throw new MergeConflictOnRemote(idsAndVersionsSorted);
  }
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map(version => mergedComponent.toBitId().changeVersion(version));
  return BitIds.fromArray(R.flatten(mergedComponents.map(getMergedIds)));
}

/**
 * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
 * a result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
 * to the bare-scope name.
 * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
 */
function convertNonScopeToCorrectScope(
  scope: Scope,
  componentsObjects: { component: ModelComponent, objects: BitObject[] },
  remoteScope: string
): void {
  const getIdWithUpdatedScope = (dependencyId: BitId): BitId => {
    if (dependencyId.scope) return dependencyId;
    const depId = ModelComponent.fromBitId(dependencyId);
    // todo: use 'load' for async and switch the foreach with map.
    const dependencyObject = scope.objects.loadSync(depId.hash());
    if (dependencyObject instanceof Symlink) {
      return dependencyId.changeScope(dependencyObject.realScope);
    }
    return dependencyId.changeScope(remoteScope);
  };

  const getBitIdsWithUpdatedScope = (bitIds: BitIds): BitIds => {
    const updatedIds = bitIds.map(id => getIdWithUpdatedScope(id));
    return BitIds.fromArray(updatedIds);
  };

  componentsObjects.objects.forEach((object: BitObject) => {
    if (object instanceof Version) {
      const hashBefore = object.hash().toString();
      object.getAllDependencies().forEach((dependency) => {
        dependency.id = getIdWithUpdatedScope(dependency.id);
      });
      object.flattenedDependencies = getBitIdsWithUpdatedScope(object.flattenedDependencies);
      object.flattenedDevDependencies = getBitIdsWithUpdatedScope(object.flattenedDevDependencies);
      object.flattenedCompilerDependencies = getBitIdsWithUpdatedScope(object.flattenedCompilerDependencies);
      object.flattenedTesterDependencies = getBitIdsWithUpdatedScope(object.flattenedTesterDependencies);
      const hashAfter = object.hash().toString();
      if (hashBefore !== hashAfter) {
        logger.debugAndAddBreadCrumb(
          'scope._convertNonScopeToCorrectScope',
          `switching {id} version hash from ${hashBefore} to ${hashAfter}`,
          { id: componentsObjects.component.id().toString() }
        );
        const versions = componentsObjects.component.versions;
        Object.keys(versions).forEach((version) => {
          if (versions[version].toString() === hashBefore) {
            versions[version] = Ref.from(hashAfter);
          }
        });
      }
    }
  });

  componentsObjects.component.scope = remoteScope;
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
  // $FlowFixMe
  const versions: Version[] = objects.filter(object => object instanceof Version);
  await Promise.all(versions.map(version => _replaceDistsOfVersionIfNeeded(version)));

  async function _replaceDistsOfVersionIfNeeded(version: Version) {
    const dists = version.dists;
    if (!dists) return;
    await Promise.all(
      dists.map(async (dist) => {
        const newDistObject = await _createNewDistIfNeeded(version, dist);
        if (newDistObject) {
          dist.file = newDistObject.hash();
          objects.push(newDistObject);
        }
        return null;
      })
    );
  }

  async function _createNewDistIfNeeded(version: Version, dist: Object): Promise<?Source> {
    const currentHash = dist.file;
    // $FlowFixMe
    const distObject: Source = await scope.objects.load(currentHash);
    const distString = distObject.contents.toString();
    const dependenciesIds = version.getAllDependencies().map(d => d.id);
    const allIds = [...dependenciesIds, component.toBitId()];
    let newDistString = distString;
    allIds.forEach((id) => {
      const idWithoutScope = id.changeScope(null);
      const pkgNameWithoutScope = componentIdToPackageName(idWithoutScope, component.bindingPrefix);
      const pkgNameWithScope = componentIdToPackageName(id, component.bindingPrefix);
      const singleQuote = "'";
      const doubleQuotes = '"';
      [singleQuote, doubleQuotes].forEach((quoteType) => {
        newDistString = newDistString.replace(
          new RegExp(quoteType + pkgNameWithoutScope + quoteType, 'g'),
          quoteType + pkgNameWithScope + quoteType
        );
      });
    });
    if (newDistString !== distString) {
      return Source.from(Buffer.from(newDistString));
    }
    return null;
  }
}
