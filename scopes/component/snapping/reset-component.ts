import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { Consumer } from '@teambit/legacy.consumer';
import { ComponentsList } from '@teambit/legacy.component-list';
import { logger } from '@teambit/legacy.logger';
import { Lane, ModelComponent } from '@teambit/objects';
import { RemoveMain } from '@teambit/remove';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import { Workspace } from '@teambit/workspace';

export type ResetResult = {
  id: ComponentID;
  versions: string[];
  component?: ModelComponent;
  /**
   * relevant when the component was detached head so the head didn't change.
   * we want .bitmap to have the version before the detachment. not as the head.
   */
  versionToSetInBitmap?: string;
};

/**
 * If head is false, remove all local versions.
 */
export async function removeLocalVersion(
  consumer: Consumer,
  id: ComponentID,
  lane?: Lane,
  head?: boolean,
  force = false
): Promise<ResetResult> {
  const component: ModelComponent = await consumer.scope.getModelComponent(id);
  const idStr = id.toString();
  const fromBitmap = consumer.bitMap.getComponentIdIfExist(id);
  const localVersions = await component.getLocalHashes(consumer.scope.objects, fromBitmap);
  if (!localVersions.length) throw new BitError(`unable to untag ${idStr}, the component is not staged`);
  const headRef = component.getHeadRegardlessOfLane();
  if (!headRef) {
    throw new Error(`unable to reset ${idStr}, it has not head`);
  }
  if (head && !localVersions.find((v) => v.isEqual(headRef))) {
    throw new Error(`unable to reset ${idStr}, the head ${headRef.toString()} is exported`);
  }
  const versionsToRemove = head ? [headRef] : localVersions;
  const versionsToRemoveStr = component.switchHashesWithTagsIfExist(versionsToRemove);

  if (!force) {
    const dependencyGraph = await DependencyGraph.loadAllVersions(consumer.scope);

    versionsToRemoveStr.forEach((versionToRemove) => {
      const idWithVersion = component.toComponentId().changeVersion(versionToRemove);
      const dependents = dependencyGraph.getImmediateDependentsPerId(idWithVersion);
      if (dependents.length) {
        throw new BitError(
          `unable to reset ${idStr}, the version ${versionToRemove} has the following dependent(s) ${dependents.join(
            ', '
          )}`
        );
      }
    });
  }

  const headBefore = component.getHead();
  await consumer.scope.sources.removeComponentVersions(component, versionsToRemove, versionsToRemoveStr, lane, head);
  const headAfter = component.getHead();
  let versionToSetInBitmap;
  if (headBefore && headAfter && headBefore.isEqual(headAfter) && !lane) {
    // if it's on main and the head didn't change, it means that it was in a detached-head state.
    const divergeData = component.getDivergeData();
    const snapBeforeDetached = divergeData.commonSnapBeforeDiverge;
    if (snapBeforeDetached) versionToSetInBitmap = component.getTagOfRefIfExists(snapBeforeDetached);
  }

  return { id, versions: versionsToRemoveStr, component, versionToSetInBitmap };
}

export async function removeLocalVersionsForAllComponents(
  workspace: Workspace,
  remove: RemoveMain,
  lane?: Lane,
  head?: boolean
): Promise<ResetResult[]> {
  const componentsToUntag = await getComponentsWithOptionToUntag(workspace, remove);
  const force = true; // when removing local versions from all components, no need to check if the component is used as a dependency
  return removeLocalVersionsForMultipleComponents(workspace.consumer, componentsToUntag, lane, head, force);
}

export async function removeLocalVersionsForMultipleComponents(
  consumer: Consumer,
  componentsToUntag: ModelComponent[],
  lane?: Lane,
  head?: boolean,
  force?: boolean
) {
  if (!componentsToUntag.length) {
    throw new BitError(`no components found to reset on your workspace`);
  }
  // if only head is removed, there is risk of deleting dependencies version without their dependents.
  if (!force && head) {
    const dependencyGraph = await DependencyGraph.loadAllVersions(consumer.scope);
    const candidateComponentsIds = componentsToUntag.map((component) => {
      const bitId = component.toComponentId();
      const headRef = component.getHeadRegardlessOfLane();
      if (!headRef)
        throw new Error(`component ${bitId.toString()} does not have head. it should not be a candidate for reset`);

      return bitId.changeVersion(component.getTagOfRefIfExists(headRef) || headRef.toString());
    });
    const candidateComponentsIdsStr = candidateComponentsIds.map((id) => id.toString());
    candidateComponentsIds.forEach((bitId: ComponentID) => {
      const dependents = dependencyGraph.getImmediateDependentsPerId(bitId);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const dependentsNotCandidates = dependents.filter((dependent) => !candidateComponentsIdsStr.includes(dependent));
      if (dependentsNotCandidates.length) {
        throw new BitError( // $FlowFixMe
          `unable to untag ${bitId}, the version ${bitId.version} has the following dependent(s) ${dependents.join(
            ', '
          )}`
        );
      }
    });
  }
  logger.debug(`found ${componentsToUntag.length} components to untag`);
  return Promise.all(
    componentsToUntag.map((component) => removeLocalVersion(consumer, component.toComponentId(), lane, head, force))
  );
}

export async function getComponentsWithOptionToUntag(
  workspace: Workspace,
  remove: RemoveMain
): Promise<ModelComponent[]> {
  const componentList = new ComponentsList(workspace);
  const laneObj = await workspace.getCurrentLaneObject();
  const components: ModelComponent[] = await componentList.listExportPendingComponents(laneObj);
  const removedStagedIds = await remove.getRemovedStaged();
  if (!removedStagedIds.length) return components;
  const removedStagedBitIds = removedStagedIds.map((id) => id);
  const nonExistsInStaged = removedStagedBitIds.filter(
    (id) => !components.find((c) => c.toComponentId().isEqualWithoutVersion(id))
  );
  if (!nonExistsInStaged.length) return components;
  const modelComps = await Promise.all(nonExistsInStaged.map((id) => workspace.consumer.scope.getModelComponent(id)));
  components.push(...modelComps);

  return components;
}
