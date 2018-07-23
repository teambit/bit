// @flow
import { BitId } from '../../bit-id';
import ComponentModel from '../models/component';
import logger from '../../logger/logger';
import { Scope } from '..';
import GeneralError from '../../error/general-error';

export type untagResult = { id: BitId, versions: string[], component: ComponentModel };

/**
 * If not specified version, remove all local versions.
 */
export async function removeLocalVersion(
  scope: Scope,
  id: BitId,
  version?: string,
  force?: boolean = false
): Promise<untagResult> {
  const component: ComponentModel = await scope.getComponentModel(id);
  const localVersions = component.getLocalVersions();
  if (!localVersions.length) throw new GeneralError(`unable to untag ${id}, the component is not staged`);
  if (version && !component.hasVersion(version)) {
    throw new GeneralError(`unable to untag ${id}, the version ${version} does not exist`);
  }
  if (version && !localVersions.includes(version)) {
    throw new GeneralError(`unable to untag ${id}, the version ${version} was exported already`);
  }
  const versionsToRemove = version ? [version] : localVersions;

  if (!force) {
    const dependencyGraph = await scope.getDependencyGraph();

    versionsToRemove.forEach((versionToRemove) => {
      const idWithVersion = component.toBitId();
      idWithVersion.version = versionToRemove;
      const dependents = dependencyGraph.getDependentsPerId(idWithVersion);
      if (dependents.length) {
        throw new GeneralError(
          `unable to untag ${id}, the version ${versionToRemove} has the following dependent(s) ${dependents.join(
            ', '
          )}`
        );
      }
    });
  }

  await Promise.all(versionsToRemove.map(ver => scope.sources.removeVersion(component, ver, false)));
  await scope.objects.persist();

  if (!component.versionArray.length) {
    // if all versions were deleted, delete also the component itself from the model
    await component.remove(scope.objects);
  }

  return { id, versions: versionsToRemove, component };
}

export async function removeLocalVersionsForAllComponents(
  scope: Scope,
  version?: string,
  force?: boolean = false
): Promise<untagResult[]> {
  const components = await scope.objects.listComponents(false);
  const candidateComponents = components.filter((component: ComponentModel) => {
    const localVersions = component.getLocalVersions();
    if (!localVersions.length) return false;
    return version ? localVersions.includes(version) : true;
  });
  if (!candidateComponents.length) {
    const versionOutput = version ? `${version} ` : '';
    throw new GeneralError(`no components found with version ${versionOutput}to untag on your workspace`);
  }

  // if no version is given, there is risk of deleting dependencies version without their dependents.
  if (!force && version) {
    const dependencyGraph = await scope.getDependencyGraph();
    const candidateComponentsIds = candidateComponents.map((component) => {
      const bitId = component.toBitId();
      return bitId.changeVersion(version);
    });
    const candidateComponentsIdsStr = candidateComponentsIds.map(id => id.toString());

    candidateComponentsIds.forEach((bitId: BitId) => {
      const dependents = dependencyGraph.getDependentsPerId(bitId);
      const dependentsNotCandidates = dependents.filter(dependent => !candidateComponentsIdsStr.includes(dependent));
      if (dependentsNotCandidates.length) {
        throw new GeneralError( // $FlowFixMe
          `unable to untag ${bitId}, the version ${version} has the following dependent(s) ${dependents.join(', ')}`
        );
      }
    });
  }

  logger.debug(`found ${candidateComponents.length} components to untag`);
  return Promise.all(
    candidateComponents.map(component => removeLocalVersion(scope, component.toBitId(), version, true))
  );
}
