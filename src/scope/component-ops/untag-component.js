// @flow
import { ComponentNotFound } from '../exceptions';
import { BitId } from '../../bit-id';
import ComponentModel from '../models/component';
import logger from '../../logger/logger';
import { Scope } from '..';

/**
 * If not specified version, remove all local versions.
 */
export async function removeLocalVersion(
  scope: Scope,
  id: BitId,
  version?: string,
  force?: boolean = false
): Promise<{ id: BitId, versions: string[] }> {
  const component: ?ComponentModel = await scope.sources.get(id);
  if (!component) throw new ComponentNotFound(id.toString());
  const localVersions = component.getLocalVersions();
  if (!localVersions.length) return Promise.reject(`unable to untag ${id}, the component is not staged`);
  if (version && !component.hasVersion(version)) {
    return Promise.reject(`unable to untag ${id}, the version ${version} does not exist`);
  }
  if (version && !localVersions.includes(version)) {
    return Promise.reject(`unable to untag ${id}, the version ${version} was exported already`);
  }
  const versionsToRemove = version ? [version] : localVersions;

  if (!force) {
    const dependencyGraph = await scope.getDependencyGraph();

    versionsToRemove.forEach((versionToRemove) => {
      const idWithVersion = component.toBitId();
      idWithVersion.version = versionToRemove;
      const dependents = dependencyGraph.getDependentsPerId(idWithVersion);
      if (dependents.length) {
        throw new Error(
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

  return { id, versions: versionsToRemove };
}

export async function removeLocalVersionsForAllComponents(scope: Scope, version?: string, force?: boolean = false) {
  const components = await scope.objects.listComponents(false);
  const candidateComponents = components.filter((component: ComponentModel) => {
    const localVersions = component.getLocalVersions();
    if (!localVersions.length) return false;
    return version ? localVersions.includes(version) : true;
  });
  if (!candidateComponents.length) {
    const versionOutput = version ? `${version} ` : '';
    return Promise.reject(`No components found with local version ${versionOutput}to untag`);
  }

  // if no version is given, there is risk of deleting dependencies version without their dependents.
  if (!force && version) {
    const dependencyGraph = await scope.getDependencyGraph();
    const candidateComponentsIds = candidateComponents.map((component) => {
      const bitId = component.toBitId();
      bitId.version = version;
      return bitId;
    });
    const candidateComponentsIdsStr = candidateComponentsIds.map(id => id.toString());

    candidateComponentsIds.forEach((bitId: BitId) => {
      const dependents = dependencyGraph.getDependentsPerId(bitId);
      const dependentsNotCandidates = dependents.filter(dependent => !candidateComponentsIdsStr.includes(dependent));
      if (dependentsNotCandidates.length) {
        throw new Error( // $FlowFixMe
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
