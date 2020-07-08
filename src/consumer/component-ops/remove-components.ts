import R from 'ramda';
import groupArray from 'group-array';
import partition from 'lodash.partition';
import { Consumer } from '..';
import BitIds from '../../bit-id/bit-ids';
import RemovedLocalObjects from '../../scope/removed-local-objects';
import logger from '../../logger/logger';
import { LATEST_BIT_VERSION } from '../../constants';
import GeneralError from '../../error/general-error';
import { getScopeRemotes } from '../../scope/scope-remotes';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import Component from '../component/consumer-component';
import deleteComponentsFiles from '../component-ops/delete-component-files';
import * as packageJsonUtils from '../component/package-json-utils';
import { Remotes } from '../../remotes';

/**
 * Remove components local and remote
 * splits array of ids into local and remote and removes according to flags
 * @param {string[]} ids - list of remote component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 * @param {boolean} remote - delete component from a remote scope
 * @param {boolean} track - keep tracking local staged components in bitmap.
 * @param {boolean} deleteFiles - delete local added files from fs.
 */
export default async function removeComponents({
  consumer,
  ids,
  force,
  remote,
  track,
  deleteFiles
}: {
  consumer: Consumer | null | undefined; // when remote is false, it's always set
  ids: BitIds;
  force: boolean;
  remote: boolean;
  track: boolean;
  deleteFiles: boolean;
}): Promise<{ localResult: RemovedLocalObjects; remoteResult: Record<string, any>[] }> {
  logger.debugAndAddBreadCrumb('removeComponents', `{ids}. force: ${force.toString()}`, { ids: ids.toString() });
  // added this to remove support for remove only one version from a component
  const bitIdsLatest = BitIds.fromArray(
    ids.map(id => {
      return id.changeVersion(LATEST_BIT_VERSION);
    })
  );
  const [localIds, remoteIds] = partition(bitIdsLatest, id => id.isLocal());
  if (remote && localIds.length) {
    throw new GeneralError(
      `unable to remove the remote components: ${localIds.join(',')} as they don't contain a scope-name`
    );
  }
  const remoteResult = remote && !R.isEmpty(remoteIds) ? await removeRemote(consumer, remoteIds, force) : [];
  const localResult = !remote
    ? await removeLocal(consumer as Consumer, bitIdsLatest, force, track, deleteFiles)
    : new RemovedLocalObjects();

  return { localResult, remoteResult };
}

/**
 * Remove remote component from ssh server
 * this method groups remote components by remote name and deletes remote components together
 * @param {BitIds} bitIds - list of remote component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 */
async function removeRemote(consumer: Consumer | null | undefined, bitIds: BitIds, force: boolean) {
  const groupedBitsByScope = groupArray(bitIds, 'scope');
  const remotes = consumer ? await getScopeRemotes(consumer.scope) : await Remotes.getGlobalRemotes();
  const context = {};
  enrichContextFromGlobal(context);
  const scope = consumer ? consumer.scope : null;
  const removeP = Object.keys(groupedBitsByScope).map(async key => {
    const resolvedRemote = await remotes.resolve(key, scope);
    const idsStr = groupedBitsByScope[key].map(id => id.toStringWithoutVersion());
    return resolvedRemote.deleteMany(idsStr, force, context);
  });

  return Promise.all(removeP);
}

/**
 * removeLocal - remove local (imported, new staged components) from modules and bitmap according to flags
 * @param {BitIds} bitIds - list of component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 * @param {boolean} deleteFiles - delete component that are used by other components.
 */
async function removeLocal(
  consumer: Consumer,
  bitIds: BitIds,
  force: boolean,
  track: boolean,
  deleteFiles: boolean
): Promise<RemovedLocalObjects> {
  // local remove in case user wants to delete tagged components
  const modifiedComponents = new BitIds();
  const nonModifiedComponents = new BitIds(); // $FlowFixMe
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (R.isEmpty(bitIds)) return new RemovedLocalObjects();
  if (!force) {
    await Promise.all(
      bitIds.map(async id => {
        try {
          const componentStatus = await consumer.getComponentStatusById(id);
          if (componentStatus.modified) modifiedComponents.push(id);
          else nonModifiedComponents.push(id);
        } catch (err) {
          // if a component has an error, such as, missing main file, we do want to allow removing that component
          if (Component.isComponentInvalidByErrorType(err)) {
            nonModifiedComponents.push(id);
          } else {
            throw err;
          }
        }
      })
    );
  }
  const idsToRemove = force ? bitIds : nonModifiedComponents;
  const { components: componentsToRemove, invalidComponents } = await consumer.loadComponents(idsToRemove, false);
  const {
    removedComponentIds,
    missingComponents,
    dependentBits,
    removedDependencies
  } = await consumer.scope.removeMany(idsToRemove, force, true, consumer);

  if (!R.isEmpty(removedComponentIds)) {
    const removedComponents = componentsToRemove.filter(c => removedComponentIds.hasWithoutVersion(c.id));
    await deleteComponentsFiles(consumer, removedComponentIds, deleteFiles);
    await deleteComponentsFiles(consumer, removedDependencies, false);
    if (!track) {
      const invalidComponentsIds = invalidComponents.map(i => i.id);
      await packageJsonUtils.removeComponentsFromWorkspacesAndDependencies(
        consumer,
        removedComponents,
        invalidComponentsIds
      );
      await consumer.cleanFromBitMap(removedComponentIds, removedDependencies);
    }
  }
  return new RemovedLocalObjects(
    removedComponentIds,
    missingComponents,
    modifiedComponents,
    removedDependencies,
    dependentBits
  );
}
