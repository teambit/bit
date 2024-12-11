import { SemVer } from 'semver';
import { PeerDependenciesMeta } from '../dependencies/dependency-list';
import { PackageName, SemverVersion } from '../dependencies';

// export type ManifestDependenciesKeys = 'dependencies' | 'devDependencies' | 'peerDependencies';

export type ManifestDependenciesKeys = {
  dependencies: 'dependencies';
  optionalDependencies: 'optionalDependencies';
  devDependencies: 'devDependencies';
  peerDependencies: 'peerDependencies';
};

export type ManifestDependenciesKeysNames = keyof ManifestDependenciesKeys;

export type ManifestDependenciesObject = Partial<Record<ManifestDependenciesKeysNames, DepObjectValue>> & {
  peerDependenciesMeta?: PeerDependenciesMeta;
};

export type DepObjectValue = Record<PackageName, SemverVersion>;

export interface ManifestToJsonOptions {
  copyPeerToRuntime?: boolean;
}

export class Manifest {
  constructor(
    public name: string,
    public version: SemVer,
    public dependencies: ManifestDependenciesObject
  ) {}

  // Should be implemented on sub classes
  // get dir(): string {
  //   throw new BitError('not implemented');
  // }

  toJson(options: ManifestToJsonOptions = {}): Record<string, any> {
    let dependencies = this.dependencies.dependencies || {};
    const optionalDependencies = this.dependencies.optionalDependencies || {};
    const devDependencies = this.dependencies.devDependencies || {};
    const peerDependencies = this.dependencies.peerDependencies || {};
    const peerDependenciesMeta = this.dependencies.peerDependenciesMeta || {};
    if (options.copyPeerToRuntime) {
      dependencies = { ...peerDependencies, ...dependencies };
    }
    const manifest = {
      name: this.name,
      version: this.version.version,
      dependencies,
      optionalDependencies,
      devDependencies,
      peerDependencies,
      peerDependenciesMeta,
    };
    // if (options.includeDir) {
    //   return {
    //     rootDir: this.dir,
    //     manifest,
    //   };
    // }
    return manifest;
  }
}
