import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { Scope } from '@teambit/legacy/dist/scope';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ComponentsList } from '@teambit/legacy.component-list';
import logger from '@teambit/legacy/dist/logger/logger';
import { Lane, ModelComponent } from '@teambit/legacy/dist/scope/models';
import { RemoveMain } from '@teambit/remove';

export type ResetResult = { id: ComponentID; versions: string[]; component?: ModelComponent };

/**
 * If head is false, remove all local versions.
 */
export async function removeLocalVersion(
  scope: Scope,
  id: ComponentID,
  lane?: Lane,
  head?: boolean,
  force = false
): Promise<ResetResult> {
  const component: ModelComponent = await scope.getModelComponent(id);
  const idStr = id.toString();
  const localVersions = await component.getLocalHashes(scope.objects);
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
    const dependencyGraph = await scope.getDependencyGraph();

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

  await scope.sources.removeComponentVersions(component, versionsToRemove, versionsToRemoveStr, lane, head);

  return { id, versions: versionsToRemoveStr, component };
}

export async function removeLocalVersionsForAllComponents(
  consumer: Consumer,
  remove: RemoveMain,
  lane?: Lane,
  head?: boolean
): Promise<ResetResult[]> {
  const componentsToUntag = await getComponentsWithOptionToUntag(consumer, remove);
  const force = true; // when removing local versions from all components, no need to check if the component is used as a dependency
  return removeLocalVersionsForMultipleComponents(componentsToUntag, lane, head, force, consumer.scope);
}

export async function removeLocalVersionsForMultipleComponents(
  componentsToUntag: ModelComponent[],
  lane?: Lane,
  head?: boolean,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  force: boolean,
  scope: Scope
) {
  if (!componentsToUntag.length) {
    throw new BitError(`no components found to reset on your workspace`);
  }
  // if only head is removed, there is risk of deleting dependencies version without their dependents.
  if (!force && head) {
    const dependencyGraph = await scope.getDependencyGraph();
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
    componentsToUntag.map((component) => removeLocalVersion(scope, component.toComponentId(), lane, head, force))
  );
}

export async function getComponentsWithOptionToUntag(
  consumer: Consumer,
  remove: RemoveMain
): Promise<ModelComponent[]> {
  const componentList = new ComponentsList(consumer);
  const laneObj = await consumer.getCurrentLaneObject();
  const components: ModelComponent[] = await componentList.listExportPendingComponents(laneObj);
  const removedStagedIds = await remove.getRemovedStaged();
  if (!removedStagedIds.length) return components;
  const removedStagedBitIds = removedStagedIds.map((id) => id);
  const nonExistsInStaged = removedStagedBitIds.filter(
    (id) => !components.find((c) => c.toComponentId().isEqualWithoutVersion(id))
  );
  if (!nonExistsInStaged.length) return components;
  const modelComps = await Promise.all(nonExistsInStaged.map((id) => consumer.scope.getModelComponent(id)));
  components.push(...modelComps);

  return components;
}
