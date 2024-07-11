import fs from 'fs-extra';
import groupArray from 'group-array';
import partition from 'lodash.partition';
import { Workspace } from '@teambit/workspace';
import { ComponentIdList } from '@teambit/component-id';
import { compact, isEmpty } from 'lodash';
import { CENTRAL_BIT_HUB_NAME, CENTRAL_BIT_HUB_URL, LATEST_BIT_VERSION } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import logger from '@teambit/legacy/dist/logger/logger';
import { Http } from '@teambit/legacy/dist/scope/network/http';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { deleteComponentsFiles } from './delete-component-files';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';
import pMapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { getNodeModulesPathOfComponent } from '@teambit/pkg.modules.component-package-name';
import { RemovedLocalObjects } from './removed-local-objects';

export type RemoveComponentsResult = { localResult: RemovedLocalObjects; remoteResult: RemovedObjects[] };

/**
 * Remove components local and remote
 * splits array of ids into local and remote and removes according to flags
 * @param {string[]} ids - list of remote component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 * @param {boolean} remote - delete component from a remote scope
 * @param {boolean} track - keep tracking local staged components in bitmap.
 * @param {boolean} deleteFiles - delete local added files from fs.
 */
export async function removeComponents({
  workspace,
  ids,
  force,
  remote,
  track,
  deleteFiles,
}: {
  workspace?: Workspace; // when remote is false, it's always set
  ids: ComponentIdList;
  force: boolean;
  remote: boolean;
  track: boolean;
  deleteFiles: boolean;
}): Promise<RemoveComponentsResult> {
  logger.debugAndAddBreadCrumb('removeComponents', `{ids}. force: ${force.toString()}`, { ids: ids.toString() });
  // added this to remove support for remove only one version from a component
  const bitIdsLatest = ComponentIdList.fromArray(
    ids.map((id) => {
      return id.changeVersion(LATEST_BIT_VERSION);
    })
  );
  const [localIds, remoteIds] = partition(bitIdsLatest, (id) => id.isLocal());
  if (remote && localIds.length) {
    throw new BitError(
      `unable to remove the remote components: ${localIds.join(',')} as they don't contain a scope-name`
    );
  }
  const remoteResult = remote && !isEmpty(remoteIds) ? await removeRemote(workspace, remoteIds, force) : [];
  const localResult = !remote
    ? await removeLocal(workspace as Workspace, bitIdsLatest, force, track, deleteFiles)
    : new RemovedLocalObjects();

  return { localResult, remoteResult };
}

/**
 * Remove remote component from the remote
 * this method groups remote components by remote name and deletes remote components together
 * @param {ComponentIdList} bitIds - list of remote component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 */
async function removeRemote(
  workspace: Workspace | undefined,
  bitIds: ComponentIdList,
  force: boolean
): Promise<RemovedObjects[]> {
  const groupedBitsByScope = groupArray(bitIds, 'scope');
  const remotes = workspace ? await getScopeRemotes(workspace.scope.legacyScope) : await Remotes.getGlobalRemotes();
  const shouldGoToCentralHub = remotes.shouldGoToCentralHub(Object.keys(groupedBitsByScope));
  if (shouldGoToCentralHub) {
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    return http.deleteViaCentralHub(
      bitIds.map((id) => id.toString()),
      { force, idsAreLanes: false }
    );
  }
  const context = {};
  const removeP = Object.keys(groupedBitsByScope).map(async (key) => {
    const resolvedRemote = await remotes.resolve(key, workspace?.scope.legacyScope);
    const idsStr = groupedBitsByScope[key].map((id) => id.toStringWithoutVersion());
    return resolvedRemote.deleteMany(idsStr, force, context);
  });

  return Promise.all(removeP);
}

/**
 * removeLocal - remove local (imported, new staged components) from modules and bitmap according to flags
 * @param {ComponentIdList} bitIds - list of component ids to delete
 * @param {boolean} force - delete component that are used by other components.
 * @param {boolean} deleteFiles - delete component that are used by other components.
 */
async function removeLocal(
  workspace: Workspace,
  bitIds: ComponentIdList,
  force: boolean,
  track: boolean,
  deleteFiles: boolean
): Promise<RemovedLocalObjects> {
  const consumer = workspace.consumer;
  // local remove in case user wants to delete tagged components
  const modifiedComponents = new ComponentIdList();
  const nonModifiedComponents = new ComponentIdList();
  if (!bitIds.length) return new RemovedLocalObjects();
  if (!force) {
    const newIds: string[] = [];
    await pMapSeries(bitIds, async (id) => {
      try {
        const componentStatus = await workspace.getComponentStatusById(id);
        if (componentStatus.newlyCreated) newIds.push(id.toStringWithoutVersion());
        if (componentStatus.modified) modifiedComponents.push(id);
        else nonModifiedComponents.push(id);
      } catch (err: any) {
        // if a component has an error, such as, missing main file, we do want to allow removing that component
        if (Component.isComponentInvalidByErrorType(err)) {
          nonModifiedComponents.push(id);
        } else {
          throw err;
        }
      }
    });
    if (newIds.length) {
      const list = await workspace.listWithInvalid();
      list.components.forEach((c) => {
        if (bitIds.hasWithoutVersion(c.id)) return; // it gets deleted anyway
        const aspectIds = c.state.aspects.ids;
        const used = newIds.find((newId) => aspectIds.includes(newId));
        if (used)
          throw new BitError(`Unable to remove ${c.id.toStringWithoutVersion()}.
This component is 1) an aspect 2) is used by other components, such as "${c.id.toStringWithoutVersion()}" 3) it's a new component so it can't be installed as a package.
Removing this component from the workspace will disrupt the functionality of other components that depend on it, and resolving these issues may not be straightforward.
If you understand the risks and wish to proceed with the removal, please use the --force flag.
`);
      });
    }
  }
  const idsToRemove = force ? bitIds : nonModifiedComponents;
  const componentsList = new ComponentsList(consumer);
  const newComponents = (await componentsList.listNewComponents(false)) as ComponentIdList;
  const idsToRemoveFromScope = ComponentIdList.fromArray(
    idsToRemove.filter((id) => !newComponents.hasWithoutVersion(id))
  );
  const idsToCleanFromWorkspace = ComponentIdList.fromArray(
    idsToRemove.filter((id) => newComponents.hasWithoutVersion(id))
  );
  const { components: componentsToRemove } = await consumer.loadComponents(idsToRemove, false);
  const { removedComponentIds, missingComponents, dependentBits, removedFromLane } = await consumer.scope.removeMany(
    idsToRemoveFromScope,
    force,
    consumer
  );
  // otherwise, components should still be in .bitmap file
  idsToCleanFromWorkspace.push(...removedComponentIds);
  if (idsToCleanFromWorkspace.length) {
    if (deleteFiles) await deleteComponentsFiles(consumer, idsToCleanFromWorkspace);
    if (!track) {
      const removedComponents = componentsToRemove.filter((c) => idsToCleanFromWorkspace.hasWithoutVersion(c.id));
      await consumer.packageJson.removeComponentsFromDependencies(removedComponents);
      await removeComponentsFromNodeModules(consumer, removedComponents);
      await consumer.cleanFromBitMap(idsToCleanFromWorkspace);
      await workspace.cleanFromConfig(idsToCleanFromWorkspace);
    }
  }
  return new RemovedLocalObjects(
    ComponentIdList.uniqFromArray([...idsToCleanFromWorkspace, ...removedComponentIds]),
    missingComponents,
    modifiedComponents,
    dependentBits,
    removedFromLane
  );
}

export async function removeComponentsFromNodeModules(consumer: Consumer, components: ConsumerComponent[]) {
  logger.debug(`removeComponentsFromNodeModules: ${components.map((c) => c.id.toString()).join(', ')}`);
  const pathsToRemoveWithNulls = components.map((c) => {
    return getNodeModulesPathOfComponent({ ...c, id: c.id });
  });
  const pathsToRemove = compact(pathsToRemoveWithNulls);
  logger.debug(`deleting the following paths: ${pathsToRemove.join('\n')}`);
  return Promise.all(pathsToRemove.map((componentPath) => fs.remove(consumer.toAbsolutePath(componentPath))));
}
