import { SemVer } from 'semver';
import { VariantPolicy } from '../policy';

import { ComponentsManifestsMap } from '../types';
import { Manifest, ManifestToJsonOptions, ManifestDependenciesObject } from './manifest';

export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  installPeersFromEnvs?: boolean;
}

export class WorkspaceManifest extends Manifest {
  constructor(
    // TODO: please prefer readonly on public
    public name: string,
    public version: SemVer,
    public dependencies: ManifestDependenciesObject,
    private envSelfPeersPolicy: VariantPolicy | undefined,
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
      const peersManifest = this.envSelfPeersPolicy?.toVersionManifest();
      manifest.dependencies = manifest.dependencies || {};
      Object.assign(manifest.dependencies, peersManifest);
    }
    return manifest;
  }

  toJsonWithDir(options: WorkspaceManifestToJsonOptions = {}): { rootDir: string; manifest: Record<string, any> } {
    return {
      manifest: this.toJson(options),
      rootDir: this.rootDir,
    };
  }
}
