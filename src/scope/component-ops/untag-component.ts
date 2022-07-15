import { BitError } from '@teambit/bit-error';
import { Scope } from '..';
import { BitId } from '../../bit-id';
import { Consumer } from '../../consumer';
import ComponentsList from '../../consumer/component/components-list';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import { Lane } from '../models';
import ModelComponent from '../models/model-component';

export type untagResult = { id: BitId; versions: string[]; component?: ModelComponent };

/**
 * If not specified version, remove all local versions.
 */
export async function removeLocalVersion(
  scope: Scope,
  id: BitId,
  lane: Lane | null,
  head?: string,
  force = false
): Promise<untagResult> {
  const component: ModelComponent = await scope.getModelComponentIgnoreScope(id);
  await component.setDivergeData(scope.objects);
  const idStr = id.toString();
  const localVersions = component.getLocalHashes();
  if (!localVersions.length) throw new GeneralError(`unable to untag ${idStr}, the component is not staged`);
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
      const idWithVersion = component.toBitId().changeVersion(versionToRemove);
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

  const allVersionsObjects = await Promise.all(
    versionsToRemoveStr.map((localVer) => component.loadVersion(localVer, scope.objects))
  );
  scope.sources.removeComponentVersions(component, versionsToRemoveStr, allVersionsObjects, lane);

  return { id, versions: versionsToRemoveStr, component };
}

export async function removeLocalVersionsForAllComponents(
  consumer: Consumer,
  lane: Lane | null,
  head?: boolean,
  force = false
): Promise<untagResult[]> {
  const componentsToUntag = await getComponentsWithOptionToUntag(consumer);
  return removeLocalVersionsForMultipleComponents(componentsToUntag, lane, head, force, consumer.scope);
}

export async function removeLocalVersionsForMultipleComponents(
  componentsToUntag: ModelComponent[],
  lane: Lane | null,
  head?: boolean,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  force: boolean,
  scope: Scope
) {
  if (!componentsToUntag.length) {
    throw new GeneralError(`no components found to untag on your workspace`);
  }
  // if only head is removed, there is risk of deleting dependencies version without their dependents.
  if (!force && head) {
    const dependencyGraph = await scope.getDependencyGraph();
    const candidateComponentsIds = componentsToUntag.map((component) => {
      const bitId = component.toBitId();
      const headRef = component.getHeadRegardlessOfLane();
      if (!headRef)
        throw new Error(`component ${bitId.toString()} does not have head. it should not be a candidate for reset`);

      return bitId.changeVersion(component.getTagOfRefIfExists(headRef) || headRef.toString());
    });
    const candidateComponentsIdsStr = candidateComponentsIds.map((id) => id.toString());
    candidateComponentsIds.forEach((bitId: BitId) => {
      const dependents = dependencyGraph.getImmediateDependentsPerId(bitId);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const dependentsNotCandidates = dependents.filter((dependent) => !candidateComponentsIdsStr.includes(dependent));
      if (dependentsNotCandidates.length) {
        throw new GeneralError( // $FlowFixMe
          `unable to untag ${bitId}, the version ${bitId.version} has the following dependent(s) ${dependents.join(
            ', '
          )}`
        );
      }
    });
  }
  logger.debug(`found ${componentsToUntag.length} components to untag`);
  return Promise.all(
    componentsToUntag.map((component) => removeLocalVersion(scope, component.toBitId(), lane, head, true))
  );
}

export async function getComponentsWithOptionToUntag(consumer: Consumer): Promise<ModelComponent[]> {
  const componentList = new ComponentsList(consumer);
  const laneObj = await consumer.getCurrentLaneObject();
  const components: ModelComponent[] = await componentList.listExportPendingComponents(laneObj);

  return components;
}
