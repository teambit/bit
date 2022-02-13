import { SemVer } from 'semver';
import { PeersAutoDetectPolicy } from '..';

import { ComponentsManifestsMap } from '../types';
import { Manifest, ManifestToJsonOptions, ManifestDependenciesObject } from './manifest';

export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  includeDir?: boolean;
  installPeersFromEnvs?: boolean;
}

export class WorkspaceManifest extends Manifest {
  constructor(
    // TODO: please prefer readonly on public
    public name: string,
    public version: SemVer,
    public dependencies: ManifestDependenciesObject,
    private envPeersAutoDetectPolicy: PeersAutoDetectPolicy | undefined,
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
    if (options.installPeersFromEnvs) {
      const peersManifest = this.envPeersAutoDetectPolicy?.toVersionManifest();
      manifest.dependencies = manifest.dependencies || {};
      Object.assign(manifest.dependencies, peersManifest);
    }
    if (options.includeDir) {
      return {
        rootDir: this.dir,
        manifest,
      };
    }
    return manifest;
  }
}
