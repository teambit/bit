import type { DependencyLifecycleType } from '../dependencies';
import type { SemverVersion } from '@teambit/dependencies.modules.dependency-resolver-contracts';

export type {
  SemverVersion,
  PolicyConfigKeys,
  PolicyConfigKeysNames,
} from '@teambit/dependencies.modules.dependency-resolver-contracts';

// TODO: add DetailedDependencyPolicy once support the force prop
// export type DependencyPolicy = SemverVersionRule | DetailedDependencyPolicy;

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

export interface Policy<T> {
  toConfigObject(): T;
}

export type PolicyEntry = {
  dependencyId: string;
  lifecycleType: DependencyLifecycleType;
  // TODO: try to add this as generic?
  // value: any,
};
