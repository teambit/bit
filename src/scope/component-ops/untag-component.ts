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
  version?: string,
  force = false
): Promise<untagResult> {
  const component: ModelComponent = await scope.getModelComponentIgnoreScope(id);
  await component.setDivergeData(scope.objects);
  const idStr = id.toString();
  const localVersions = component.getLocalTagsOrHashes();
  if (!localVersions.length) throw new GeneralError(`unable to untag ${idStr}, the component is not staged`);
  if (version) {
    const hasVersion = await component.hasVersion(version, scope.objects, false);
    if (!hasVersion) {
      throw new GeneralError(`unable to untag ${idStr}, the version ${version} does not exist`);
    }
  }
  if (version && !localVersions.includes(version)) {
    throw new GeneralError(`unable to untag ${idStr}, the version ${version} was exported already`);
  }
  if (version && component.hasHead()) {
    const headTagOrSnap = component.getHeadAsTagIfExist();
    if (version !== headTagOrSnap && version !== component.laneHeadLocal?.toString()) {
      throw new GeneralError(`unable to untag "${idStr}", the version "${version}" is not the head.
as a result, newer versions have this version as part of their history`);
    }
  }
  const versionsToRemove = version ? [version] : localVersions;

  if (!force) {
    const dependencyGraph = await scope.getDependencyGraph();

    versionsToRemove.forEach((versionToRemove) => {
      const idWithVersion = component.toBitId().changeVersion(versionToRemove);
      const dependents = dependencyGraph.getImmediateDependentsPerId(idWithVersion);
      if (dependents.length) {
        throw new GeneralError(
          `unable to untag ${idStr}, the version ${versionToRemove} has the following dependent(s) ${dependents.join(
            ', '
          )}`
        );
      }
    });
  }

  const allVersionsObjects = await Promise.all(
    versionsToRemove.map((localVer) => component.loadVersion(localVer, scope.objects))
  );
  scope.sources.removeComponentVersions(component, versionsToRemove, allVersionsObjects, lane);

  return { id, versions: versionsToRemove, component };
}

export async function removeLocalVersionsForAllComponents(
  consumer: Consumer,
  lane: Lane | null,
  version?: string,
  force = false
): Promise<untagResult[]> {
  const componentsToUntag = await getComponentsWithOptionToUntag(consumer, version);
  return removeLocalVersionsForMultipleComponents(componentsToUntag, lane, version, force, consumer.scope);
}

export async function removeLocalVersionsForComponentsMatchedByWildcard(
  consumer: Consumer,
  lane: Lane | null,
  version?: string,
  force = false,
  idWithWildcard?: string
): Promise<untagResult[]> {
  const candidateComponents = await getComponentsWithOptionToUntag(consumer, version);
  const componentsToUntag = idWithWildcard
    ? ComponentsList.filterComponentsByWildcard(candidateComponents, idWithWildcard)
    : candidateComponents;
  return removeLocalVersionsForMultipleComponents(componentsToUntag, lane, version, force, consumer.scope);
}

export async function removeLocalVersionsForMultipleComponents(
  componentsToUntag: ModelComponent[],
  lane: Lane | null,
  version?: string,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  force: boolean,
  scope: Scope
) {
  if (!componentsToUntag.length) {
    const versionOutput = version ? `${version} ` : '';
    throw new GeneralError(`no components found with version ${versionOutput}to untag on your workspace`);
  }
  // if no version is given, there is risk of deleting dependencies version without their dependents.
  if (!force && version) {
    const dependencyGraph = await scope.getDependencyGraph();
    const candidateComponentsIds = componentsToUntag.map((component) => {
      const bitId = component.toBitId();
      return bitId.changeVersion(version);
    });
    const candidateComponentsIdsStr = candidateComponentsIds.map((id) => id.toString());
    candidateComponentsIds.forEach((bitId: BitId) => {
      const dependents = dependencyGraph.getImmediateDependentsPerId(bitId);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const dependentsNotCandidates = dependents.filter((dependent) => !candidateComponentsIdsStr.includes(dependent));
      if (dependentsNotCandidates.length) {
        throw new GeneralError( // $FlowFixMe
          `unable to untag ${bitId}, the version ${version} has the following dependent(s) ${dependents.join(', ')}`
        );
      }
    });
  }
  logger.debug(`found ${componentsToUntag.length} components to untag`);
  return Promise.all(
    componentsToUntag.map((component) => removeLocalVersion(scope, component.toBitId(), lane, version, true))
  );
}

export async function getComponentsWithOptionToUntag(consumer: Consumer, version?: string): Promise<ModelComponent[]> {
  const componentList = new ComponentsList(consumer);
  const laneObj = await consumer.getCurrentLaneObject();
  const components: ModelComponent[] = await componentList.listExportPendingComponents(laneObj);
  const candidateComponents = components.filter((component: ModelComponent) => {
    const localVersions = component.getLocalTagsOrHashes();
    if (!localVersions.length) return false;
    return version ? localVersions.includes(version) : true;
  });
  return candidateComponents;
}
