import { Component } from '@teambit/component';

/**
 * This function will calculate the package version for a component.
 * It is used mainly for supporting lanes and snaps during capsule creation
 * The general format is like this:
 * {closestTagSemver}-{snapHash}
 * but there are some exceptions:
 * in case the snapHash equal to the closestTagSemver snap hash the format will be just
 * {closestTagSemver}
 * In case the component is new the result will be: 0.0.0
 * @param component
 */
export async function getComponentPackageVersion(component: Component, snapId?: string): Promise<string> {
  const actualSnapId = snapId || component.head?.hash;
  if (!actualSnapId) {
    return '0.0.0';
  }
  // Checking if the snap is already a tag
  const tagBySnap = component.tags.byHash(actualSnapId);
  if (tagBySnap) {
    return `${tagBySnap.version}`;
  }
  const closestTag = await component.getClosestTag(actualSnapId);
  if (!closestTag) {
    return `0.0.0-${actualSnapId}`;
  }
  return `${closestTag.version}-${actualSnapId}`;
}
