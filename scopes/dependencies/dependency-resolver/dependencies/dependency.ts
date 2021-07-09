import type { DependencySource } from '../policy/variant-policy/variant-policy';

export type DependencyLifecycleType = 'runtime' | 'dev' | 'peer';

export interface SerializedDependency {
  id: string;
  version: string;
  __type: string;
  lifecycle: string;
  source?: DependencySource;
}

/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type SemverVersion = string;
export type PackageName = string;

export type DependencyManifest = {
  packageName: PackageName;
  version: SemverVersion;
};

export interface Dependency {
  id: string;
  version: string;
  type: string;
  lifecycle: DependencyLifecycleType;
  source?: DependencySource;

  serialize: <T extends SerializedDependency>() => T;
  setVersion: (newVersion: string) => void;
  toManifest: () => DependencyManifest;
  getPackageName?: () => string;
}
