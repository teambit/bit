// TODO: add DetailedDependencyPolicy once support the force prop
// export type DependencyPolicy = SemverVersionRule | DetailedDependencyPolicy;

/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type SemverVersion = string;

export type GitUrlVersion = string;

export type FileSystemPath = string;

/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type PolicySemver = SemverVersion | '-';
/**
 * Allowed values are valid semver values, git urls, fs path and the "-" sign.
 */
export type PolicyVersion = PolicySemver | GitUrlVersion | FileSystemPath;

// export interface DependenciesPolicyObject {
//   [dependencyId: string]: DependencyPolicy;
// }

export interface Policy {
  toObject(): DependenciesPolicyObject;
}
