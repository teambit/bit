import mapSeries from 'p-map-series';
import { compact, partition } from 'lodash';
import R from 'ramda';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { Remote, Remotes } from '../../remotes';
import { ComponentNotFound, MergeConflict, MergeConflictOnRemote } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { Lane, Version, ModelComponent, VersionHistory } from '../models';
import Scope from '../scope';
import { getScopeRemotes } from '../scope-remotes';
import { ObjectList } from '../objects/object-list';
import { ExportPersist, ExportValidate, RemovePendingDir } from '../actions';
import loader from '../../cli/loader';
import { PersistFailed } from '../exceptions/persist-failed';
import { MergeResult } from '../repositories/sources';
import { Ref } from '../objects';
import { BitObjectList } from '../objects/bit-object-list';
import { pMapPool } from '../../utils/promise-with-concurrent';
import { concurrentComponentsLimit } from '../../utils/concurrency';

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
  const scopeComponentsImporter = scope.scopeImporter;
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
  const { mergedIds, mergedComponentsResults, mergedLanes } = await mergeObjects(scope, bitObjectList);
  const mergedComponents = mergedComponentsResults.map((_) => _.mergedComponent);
  const versionObjects = objectsNotRequireMerge.filter((o) => o instanceof Version) as Version[];
  const versionsHistory = await updateVersionHistory(scope, mergedComponents, versionObjects);
  const allObjects = [...mergedComponents, ...mergedLanes, ...objectsNotRequireMerge, ...versionsHistory];
  scope.objects.validateObjects(true, allObjects);
  await scope.objects.writeObjectsToTheFS(allObjects);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');

  return mergedIds;
}

/**
 * Previously, the VersionHistory was populated during fetch. However, we want the fetch operation to be more efficient
 * so we move this logic to the export operation.
 * Before version 0.2.22, the Version object didn't have any info about the component-id, so we do update only for
 * rebase. For versions that tagged by > 0.2.22, we have the "origin.id" and we know to what component this version
 * belongs to.
 */
async function updateVersionHistory(
  scope: Scope,
  mergedComponents: ModelComponent[],
  versionObjects: Version[]
): Promise<VersionHistory[]> {
  const versionsWithComponentId = versionObjects.filter((obj) => obj.origin?.id);

  const [versionsWithOrigin, versionWithoutOrigin] = partition(versionsWithComponentId, (v) => v.origin?.id);

  const versionHistoryOfVersionsWithOrigin = await _updateVersionHistoryForVersionsWithOrigin(
    scope,
    mergedComponents,
    versionsWithOrigin
  );

  const versionHistoryOfVersionsWithoutOrigin = await _updateVersionHistoryForVersionsWithoutOrigin(
    scope,
    mergedComponents,
    versionWithoutOrigin
  );

  return [...versionHistoryOfVersionsWithOrigin, ...versionHistoryOfVersionsWithoutOrigin];
}

/**
 * In case of rebase (squash / unrelated) where the version history is changed, make the necessary changes in the
 * VersionHistory.
 * Because previously (bit-version < 0.2.22) we only knew about this from the Version object, and the Version object
 * didn't have any info about what the component-id is, we have to iterate all model-components, grab their
 * version-history and check whether the version-hash is inside their VersionHistory.
 * it's not ideal performance wise. however, in most cases, this rebase is about squashing, and when squashing, it's
 * done for the entire lane, so all components need to be updated regardless.
 */
async function _updateVersionHistoryForVersionsWithoutOrigin(
  scope: Scope,
  mergedComponents: ModelComponent[],
  versionWithoutOrigin: Version[]
): Promise<VersionHistory[]> {
  const mutatedVersionObjects = versionWithoutOrigin.filter((v) => v.squashed || v.unrelated);
  if (!mutatedVersionObjects.length) return [];
  logger.debug(`_updateVersionHistoryForVersionsWithoutOrigin, found ${mutatedVersionObjects.length} mutated version`);
  const versionsHistory = await Promise.all(
    mergedComponents.map(async (modelComp) =>
      modelComp.updateRebasedVersionHistory(scope.objects, mutatedVersionObjects)
    )
  );
  const versionsHistoryNoNull = compact(versionsHistory);
  logger.debug(`_updateVersionHistoryForVersionsWithoutOrigin, found ${
    versionsHistoryNoNull.length
  } versionsHistory to update
${versionsHistoryNoNull.map((v) => v.bitId.toString()).join(', ')}`);

  return versionsHistoryNoNull;
}

async function _updateVersionHistoryForVersionsWithOrigin(
  scope: Scope,
  mergedComponents: ModelComponent[],
  versionObjects: Version[]
): Promise<VersionHistory[]> {
  if (!versionObjects.length) return [];
  logger.debug(`_updateVersionHistoryForVersionsWithOrigin, found ${versionObjects.length} versions with origin`);
  const componentVersionMap = new Map<ModelComponent, Version[]>();
  versionObjects.forEach((version) => {
    const component = mergedComponents.find(
      (c) => c.scope === version.origin?.id.scope && c.name === version.origin?.id.name
    );
    if (!component) {
      logger.error(`updateVersionHistoryIfNeeded, unable to find component for version ${version.hash().toString()}`);
      return;
    }
    const versions = componentVersionMap.get(component) || [];
    componentVersionMap.set(component, [...versions, version]);
  });

  const versionsHistory = await pMapPool(
    mergedComponents,
    async (modelComp) => {
      const versions = componentVersionMap.get(modelComp);
      if (!versions || !versions.length) return undefined;
      return modelComp.updateVersionHistory(scope.objects, versions);
    },
    { concurrency: concurrentComponentsLimit() }
  );

  return compact(versionsHistory);
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
  bitObjectList: BitObjectList,
  throwForMissingDeps = false
): Promise<MergeObjectsResult> {
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

  const mergeAllLanesResults = await mapSeries(lanesObjects, (laneObject) =>
    scope.sources.mergeLane(laneObject, false, versions, components)
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
    scope.objects.clearObjectsFromCache(); // just in case this error is caught. we don't want to persist anything by mistake.
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
          const existingModelComponent =
            (await scope.getModelComponentIfExist(depId)) ||
            components.find((c) => c.toBitId().isEqualWithoutVersion(depId));
          if (!existingModelComponent) {
            scope.objects.clearObjectsFromCache(); // just in case this error is caught. we don't want to persist anything by mistake.
            throw new ComponentNotFound(depId.toString(), getOriginCompWithVer().toString());
          }
          const versionRef = existingModelComponent.getRef(depId.version as string);
          if (!versionRef) throw new Error(`unable to find Ref/Hash of ${depId.toString()}`);
          const objectExist =
            scope.objects.getCache(versionRef) ||
            (await scope.objects.has(versionRef)) ||
            versions.find((v) => v.hash().isEqual(versionRef));
          if (!objectExist) {
            scope.objects.clearObjectsFromCache(); // just in case this error is caught. we don't want to persist anything by mistake.
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
