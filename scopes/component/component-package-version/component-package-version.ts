import { Component } from '@teambit/component';
import { isHash } from '@teambit/component-version';

export const SNAP_VERSION_PREFIX = '0.0.0-';

/**
 * This function will calculate the package version for a component.
 * It is used mainly for supporting lanes and snaps during capsule creation
 * The general format is like this:
 * {0.0.0}-{snapHash}
 * but there are some exceptions:
 * in case the snapHash equal to the closestTagSemver snap hash the format will be just
 * {closestTagSemver}
 * @param component
 */
export function getComponentPackageVersion(component: Component, snapId?: string): string {
  const actualSnapId = snapId || component.head?.hash;
  if (!actualSnapId) {
    return '0.0.0';
  }
  // Checking if the snap is already a tag
  const tagBySnap = component.tags.byHash(actualSnapId);
  if (tagBySnap) {
    return `${tagBySnap.version}`;
  }
  return snapToSemver(actualSnapId);
}

export function snapToSemver(version: string): string {
  if (isHash(version)) return `${SNAP_VERSION_PREFIX}${version}`;
  return version;
}
