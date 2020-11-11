import { SemVer } from 'semver';

import { ComponentsManifestsMap, DependenciesObjectDefinition } from '../types';
import { Manifest, ManifestToJsonOptions } from './manifest';

export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  includeDir?: boolean;
}

export class WorkspaceManifest extends Manifest {
  constructor(
    // TODO: please prefer readonly on public
    public name: string,
    public version: SemVer,
    public dependencies: DependenciesObjectDefinition,
    private rootDir: string,
    public componentsManifestsMap: ComponentsManifestsMap
  ) {
    super(name, version, dependencies);
  }

  get dir() {
    return this.rootDir;
  }

  getComponentMap() {}

  toJson(options: WorkspaceManifestToJsonOptions = {}): Record<string, any> {
    const manifest = super.toJson(options);
    if (options.includeDir) {
      return {
        rootDir: this.dir,
        manifest,
      };
    }
    return manifest;
  }
}
