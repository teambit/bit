import { DependencyLifecycleType } from '../dependencies';

// TODO: add DetailedDependencyPolicy once support the force prop
// export type DependencyPolicy = SemverVersionRule | DetailedDependencyPolicy;

/**
 * Allowed values are valid semver values
 */
export type SemverVersion = string;

export type GitUrlVersion = string;

export type FileSystemPath = string;

export type RemoveDepSign = '-';

/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type PolicySemver = SemverVersion | RemoveDepSign;
/**
 * Allowed values are valid semver values, git urls, fs path and the "-" sign.
 */
export type PolicyVersion = PolicySemver | GitUrlVersion | FileSystemPath;

// TODO: think if it might need to be in another place and just reference there
export type PolicyConfigKeys = {
  dependencies: 'dependencies';
  devDependencies: 'devDependencies';
  peerDependencies: 'peerDependencies';
};

export type PolicyConfigKeysNames = keyof PolicyConfigKeys;

export interface Policy<T> {
  toConfigObject(): T;
}

export type PolicyEntry = {
  dependencyId: string;
  lifecycleType: DependencyLifecycleType;
  // TODO: try to add this as generic?
  // value: any,
};
