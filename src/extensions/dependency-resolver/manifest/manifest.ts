import { SemVer } from 'semver';
import { DependenciesObjectDefinition } from '../types';

export interface ManifestToJsonOptions {
  copyPeerToRuntime?: boolean;
}

export class Manifest {
  constructor(public name: string, public version: SemVer, public dependencies: DependenciesObjectDefinition) {}

  // Should be implemented on sub classes
  // get dir(): string {
  //   throw new GeneralError('not implemented');
  // }

  toJson(options: ManifestToJsonOptions = {}): Record<string, any> {
    let dependencies = this.dependencies.dependencies || {};
    const devDependencies = this.dependencies.devDependencies || {};
    const peerDependencies = this.dependencies.peerDependencies || {};
    if (options.copyPeerToRuntime) {
      dependencies = { ...peerDependencies, ...dependencies };
    }
    const manifest = {
      name: this.name,
      version: this.version.version,
      dependencies,
      devDependencies,
      peerDependencies,
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
