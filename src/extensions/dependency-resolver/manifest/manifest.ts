import { SemVer } from 'semver';
import GeneralError from '../../../error/general-error';
import { DependenciesObjectDefinition } from '../types';

export type ManifestToJsonOptions = {
  includeDir?: boolean;
};
export class Manifest {
  constructor(public name: string, public version: SemVer, public dependencies: DependenciesObjectDefinition) {}

  // Should be implemented on sub classes
  get dir(): string {
    throw new GeneralError('not implemented');
  }

  toJson(options?: ManifestToJsonOptions): Record<string, any> {
    const manifest = {
      name,
      version: this.version.version,
      dependencies: this.dependencies.dependencies || {},
      devDependencies: this.dependencies.devDependencies || {},
      peerDependencies: this.dependencies.peerDependencies || {},
    };
    if (options.includeDir) {
      return {
        rootDir: this.dir,
        manifest,
      };
    }
    return manifest;
  }
}
