import { Component } from '@teambit/component';
import { isHash } from '@teambit/component-version';

export const SNAP_VERSION_PREFIX = '0.0.0-';

/**
 * get a valid semver package version of a component.
 */
export function getComponentPackageVersion(component: Component): string {
  const version = component.id.version;
  if (!version)
    throw new Error(`getComponentPackageVersion: component ${component.id.toString()} is missing a version`);
  return snapToSemver(version);
}

export function snapToSemver(version: string): string {
  if (isHash(version)) return `${SNAP_VERSION_PREFIX}${version}`;
  return version;
}
