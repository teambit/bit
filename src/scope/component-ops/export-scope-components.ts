import mapSeries from 'p-map-series';
import R from 'ramda';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { Remote, Remotes } from '../../remotes';
import { ComponentNotFound, MergeConflict, MergeConflictOnRemote } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { Lane, Version, ModelComponent } from '../models';
import Scope from '../scope';
import { getScopeRemotes } from '../scope-remotes';
import ScopeComponentsImporter from './scope-components-importer';
import { ObjectList } from '../objects/object-list';
import { ExportPersist, ExportValidate, RemovePendingDir } from '../actions';
import loader from '../../cli/loader';
import { PersistFailed } from '../exceptions/persist-failed';
import { MergeResult } from '../repositories/sources';
import { Ref } from '../objects';

/**
 * ** Legacy and "bit sign" Only **
 *
 * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
 * saves a component into the objects directory of the remote scope, then, resolves its
 * dependencies, saves them as well. Finally runs the build process if needed on an isolated
 * environment.
 */
export async function exportManyBareScope(scope: Scope, objectList: ObjectList): Promise<BitIds> {
  logger.debugAndAddBreadCrumb('exportManyBareScope', `started with ${objectList.objects.length} objects`);
  const mergedIds: BitIds = await saveObjects(scope, objectList);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'will try to importMany in case there are missing dependencies');
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importManyFromOriginalScopes(mergedIds); // resolve dependencies
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'successfully ran importMany');

  return mergedIds;
}

type RemotesForPersist = {
  remote: Remote;
  exportedIds?: string[];
};

/**
 * save objects into the scope.
 */
export async function saveObjects(scope: Scope, objectList: ObjectList): Promise<BitIds> {
  const bitObjectList = await objectList.toBitObjects();
  const objectsNotRequireMerge = bitObjectList.getObjectsNotRequireMerge();
  // components and lanes can't be just added, they need to be carefully merged.
  const { mergedIds, mergedComponentsResults, mergedLanes } = await mergeObjects(scope, objectList);

  const mergedComponents = mergedComponentsResults.map((_) => _.mergedComponent);
  const allObjects = [...mergedComponents, ...mergedLanes, ...objectsNotRequireMerge];
  scope.objects.validateObjects(true, allObjects);
  await scope.objects.writeObjectsToTheFS(allObjects);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');

  return mergedIds;
}

type MergeObjectsResult = { mergedIds: BitIds; mergedComponentsResults: MergeResult[]; mergedLanes: Lane[] };

/**
 * merge components into the scope.
 *
 * a component might have multiple versions that some where merged and some were not.
 * the BitIds returned here includes the versions that were merged. so it could contain multiple
 * ids of the same component with different versions
 */
export async function mergeObjects(
  scope: Scope,
  objectList: ObjectList,
  throwForMissingDeps = false
): Promise<MergeObjectsResult> {
  const bitObjectList = await objectList.toBitObjects();
  const components = bitObjectList.getComponents();
  const lanesObjects = bitObjectList.getLanes();
  const versions = bitObjectList.getVersions();
  logger.debugAndAddBreadCrumb(
    'export-scope-components.mergeObjects',
    `Going to merge ${components.length} components, ${lanesObjects.length} lanes`
  );
  const { mergeResults, errors } = lanesObjects.length
    ? { mergeResults: [], errors: [] } // for lanes, no need to merge component objects, the lane is merged later.
    : await scope.sources.mergeComponents(components, versions);

  // add all objects to the cache, it is needed for lanes later on. also it might be
  // good regardless to update the cache with the new data.
  [...components, ...versions].forEach((bitObject) => scope.objects.setCache(bitObject));

  const mergeAllLanesResults = await mapSeries(lanesObjects, (laneObject) =>
    scope.sources.mergeLane(laneObject, false)
  );
  const lanesErrors = mergeAllLanesResults.map((r) => r.mergeErrors).flat();
  const componentsNeedUpdate = [
    ...errors.filter((result) => result instanceof ComponentNeedsUpdate),
    ...lanesErrors,
  ] as ComponentNeedsUpdate[];
  const componentsWithConflicts = errors.filter((result) => result instanceof MergeConflict) as MergeConflict[];
  if (componentsWithConflicts.length || componentsNeedUpdate.length) {
    const idsAndVersions = componentsWithConflicts.map((c) => ({ id: c.id, versions: c.versions }));
    const idsAndVersionsWithConflicts = R.sortBy(R.prop('id'), idsAndVersions);
    const idsOfNeedUpdateComps = R.sortBy(
      R.prop('id'),
      componentsNeedUpdate.map((c) => ({ id: c.id, lane: c.lane }))
    );
    scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
    throw new MergeConflictOnRemote(idsAndVersionsWithConflicts, idsOfNeedUpdateComps);
  }
  if (throwForMissingDeps) await throwForMissingLocalDependencies(scope, versions, components, lanesObjects);
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const mergedLanesComponents = mergeAllLanesResults
    .map((r) => r.mergeResults)
    .flat()
    .filter(({ mergedVersions }) => mergedVersions.length);
  const mergedComponentsResults = [...mergedComponents, ...mergedLanesComponents];
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map((version) => mergedComponent.toBitId().changeVersion(version));
  const mergedIds = BitIds.uniqFromArray(mergedComponentsResults.map(getMergedIds).flat());
  const mergedLanes = mergeAllLanesResults.map((r) => r.mergeLane);

  return { mergedIds, mergedComponentsResults, mergedLanes };
}

/**
 * make sure that all local objects were actually transferred into the remote.
 * this gets called as part of the export-validate step. it doesn't check for dependencies from
 * other scopes, as they'll be retrieved later by the fetch-missing-deps step.
 * we can't wait for that step to validate local dependencies because it happens after persisting,
 * and we don't want to persist when local dependencies were not exported.
 */
async function throwForMissingLocalDependencies(
  scope: Scope,
  versions: Version[],
  components: ModelComponent[],
  lanes: Lane[]
) {
  const compsWithHeads = lanes.length
    ? lanes.map((lane) => lane.toBitIds()).flat()
    : components.map((c) => c.toBitIdWithHead());

  await Promise.all(
    versions.map(async (version) => {
      const originComp = compsWithHeads.find((id) => version.hash().toString() === id.version);
      if (!originComp) {
        // coz if an older version has a missing dep, then, it's fine. (it can easily happen when exporting lane, which
        // all old versions are exported)
        return;
      }
      const getOriginCompWithVer = () => {
        const compObj = components.find((c) => c.toBitId().isEqualWithoutVersion(originComp));
        if (!compObj) return originComp;
        const tag = compObj.getTagOfRefIfExists(Ref.from(originComp.version as string));
        if (tag) return originComp.changeVersion(tag);
        return originComp;
      };
      const depsIds = version.getAllFlattenedDependencies();
      await Promise.all(
        depsIds.map(async (depId) => {
          if (depId.scope !== scope.name) return;
          const existingModelComponent = await scope.getModelComponentIfExist(depId);
          if (!existingModelComponent) {
            scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
            throw new ComponentNotFound(depId.toString(), getOriginCompWithVer().toString());
          }
          const versionRef = existingModelComponent.getRef(depId.version as string);
          if (!versionRef) throw new Error(`unable to find Ref/Hash of ${depId.toString()}`);
          const objectExist = scope.objects.getCache(versionRef) || (await scope.objects.has(versionRef));
          if (!objectExist) {
            scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
            throw new ComponentNotFound(depId.toString(), getOriginCompWithVer().toString());
          }
        })
      );
    })
  );
}

export async function validateRemotes(remotes: Remote[], clientId: string, isResumingExport = true) {
  loader.start('verifying that objects can be merged on the remotes...');
  try {
    await Promise.all(
      remotes.map((remote) =>
        remote.action(ExportValidate.name, {
          clientId,
          isResumingExport: true,
        })
      )
    );
  } catch (err: any) {
    logger.errorAndAddBreadCrumb('validateRemotes', 'failed validating remotes', {}, err);
    if (!isResumingExport) {
      // when resuming export, we don't want to delete the pending-objects because some scopes
      // have them persisted and some not. we want to persist to all failing scopes.
      await removePendingDirs(remotes, clientId);
    }
    throw err;
  }
}

export async function persistRemotes(manyObjectsPerRemote: RemotesForPersist[], clientId: string) {
  const persistedRemotes: string[] = [];
  await mapSeries(manyObjectsPerRemote, async (objectsPerRemote: RemotesForPersist) => {
    const { remote } = objectsPerRemote;
    loader.start(`persisting data on the remote "${remote.name}"...`);
    const maxRetries = 3;
    let succeed = false;
    let lastErrMsg = '';
    for (let i = 0; i < maxRetries; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const exportedIds: string[] = await remote.action(ExportPersist.name, { clientId });
        objectsPerRemote.exportedIds = exportedIds;
        succeed = true;
        break;
      } catch (err: any) {
        lastErrMsg = err.message;
        logger.errorAndAddBreadCrumb(
          'persistRemotes',
          `failed on remote ${remote.name}, attempt ${i + 1} out of ${maxRetries}`,
          {},
          err
        );
      }
    }
    if (!succeed) {
      throw new PersistFailed([remote.name], { [remote.name]: lastErrMsg });
    }
    logger.debugAndAddBreadCrumb('persistRemotes', `successfully pushed all ids to the bare-scope ${remote.name}`);
    persistedRemotes.push(remote.name);
  });
}

export async function resumeExport(scope: Scope, exportId: string, remotes: string[]): Promise<string[]> {
  const scopeRemotes: Remotes = await getScopeRemotes(scope);
  const remotesObj = await Promise.all(remotes.map((r) => scopeRemotes.resolve(r, scope)));
  const remotesForPersist: RemotesForPersist[] = remotesObj.map((remote) => ({ remote }));
  await validateRemotes(remotesObj, exportId);
  await persistRemotes(remotesForPersist, exportId);
  return R.flatten(remotesForPersist.map((r) => r.exportedIds));
}

export async function removePendingDirs(pushedRemotes: Remote[], clientId: string) {
  await Promise.all(pushedRemotes.map((remote) => remote.action(RemovePendingDir.name, { clientId })));
}
