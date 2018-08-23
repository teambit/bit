// @flow
import R from 'ramda';
import semver from 'semver';
import ComponentModel from '../models/component';
import { BitIds } from '../../bit-id';
import Scope from '../scope';
import type { ComponentsAndVersions } from '../scope';

const removeNils = R.reject(R.isNil);

export async function bumpDependenciesVersions(
  scope: Scope,
  potentialComponents: BitIds,
  committedComponents: BitIds
): Promise<ComponentModel[]> {
  const componentsAndVersions: ComponentsAndVersions[] = await scope.getComponentsAndVersions(potentialComponents);
  const updatedComponents = await updateComponents(componentsAndVersions, scope, committedComponents);
  if (updatedComponents.length) {
    // it's easier to understand why another round of updateComponents() is needed by an example.
    // say we have 3 components, bar/foo@0.0.1 depends on utils/is-string, utils/is-string@0.0.1 depends on
    // utils/is-type, utils/is-type@0.0.1 with no dependencies.
    // when utils/is-type is tagged, utils/is-string and bar/foo are updated in the first updateComponents() round.
    // by looking at bar/foo dependencies, we find out that its utils/is-type dependency was updated to 0.0.2
    // however, its utils/is-string dependency stays with 0.0.1, because utils/is-string was never part of
    // committedComponents array.
    // this second round of updateComponents() makes sure that the auto-tagged components will be updated as well.
    const ids = updatedComponents.map(component => component.toBitIdWithLatestVersion());
    await updateComponents(componentsAndVersions, scope, BitIds.fromArray(ids), true);
  }

  return updatedComponents;
}

async function updateComponents(
  componentsAndVersions: ComponentsAndVersions[],
  scope: Scope,
  changedComponents: BitIds,
  isRound2 = false
): Promise<ComponentModel[]> {
  const componentsToUpdateP = componentsAndVersions.map(async ({ component, version }) => {
    let pendingUpdate = false;
    version.getAllFlattenedDependencies().forEach((flattenedDependency) => {
      const changedComponentId = changedComponents.searchWithoutVersion(flattenedDependency);
      if (!changedComponentId) return;
      if (semver.gt(changedComponentId.version, flattenedDependency.version)) {
        pendingUpdate = true;
        version.updateFlattenedDependency(
          flattenedDependency,
          flattenedDependency.changeVersion(changedComponentId.version)
        );
        const dependencyToUpdate = version
          .getAllDependencies()
          .find(dependency => dependency.id.isEqualWithoutVersion(flattenedDependency));
        if (dependencyToUpdate) {
          // it's a direct dependency
          dependencyToUpdate.id = dependencyToUpdate.id.changeVersion(changedComponentId.version);
        }
      }
    });
    if (pendingUpdate) {
      const message = 'bump dependencies versions';
      if (isRound2) {
        delete component.versions[component.latest()];
      }
      return scope.sources.putAdditionalVersion(component, version, message);
    }
    return null;
  });
  const updatedComponentsAll = await Promise.all(componentsToUpdateP);
  return removeNils(updatedComponentsAll);
}

export async function getAutoTagPending(
  scope: Scope,
  potentialComponents: BitIds,
  changedComponents: BitIds
): Promise<ComponentModel[]> {
  const componentsAndVersions: ComponentsAndVersions[] = await scope.getComponentsAndVersions(potentialComponents);
  const autoTagPendingComponentsP = componentsAndVersions.map(async ({ component, version }) => {
    const isAutoTagPending = version.getAllFlattenedDependencies().some((flattenedDependency) => {
      const changedComponentId = changedComponents.searchWithoutVersion(flattenedDependency);
      if (!changedComponentId) return false;
      // we only check whether a modified component may cause auto-tagging
      // since it's only modified on the file-system, its version might be the same as the version stored in its
      // dependents. That's why "semver.gte" is used instead of "semver.gt".
      return semver.gte(changedComponentId.version, flattenedDependency.version);
    });
    return isAutoTagPending ? component : null;
  });
  const autoTagPendingComponents = await Promise.all(autoTagPendingComponentsP);
  return removeNils(autoTagPendingComponents);
}
