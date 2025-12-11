import type { SemVer } from 'semver';
import type { VariantPolicy } from '../policy';

import type { ComponentsManifestsMap } from '../types';
import type { ManifestToJsonOptions, ManifestDependenciesObject } from './manifest';
import { Manifest } from './manifest';

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
      // Resolve "+" version placeholders from peersManifest
      const resolvedPeersManifest = this._resolvePlusVersions(peersManifest || {});
      manifest.dependencies = manifest.dependencies || {};
      Object.assign(manifest.dependencies, resolvedPeersManifest);
    }
    return manifest;
  }

  /**
   * Resolves "+" version placeholders in the env peers policy.
   * The "+" means: use the version from the workspace components (.bitmap or workspace.jsonc).
   */
  private _resolvePlusVersions(peersManifest: Record<string, string>): Record<string, string> {
    return Object.keys(peersManifest).reduce((acc, pkgName) => {
      const version = peersManifest[pkgName];
      if (version !== '+') {
        acc[pkgName] = version;
        return acc;
      }
      const foundVersion =
        this.dependencies.dependencies?.[pkgName] ||
        this.dependencies.optionalDependencies?.[pkgName] ||
        this.dependencies.devDependencies?.[pkgName] ||
        this.dependencies.peerDependencies?.[pkgName];
      // Fallback to '*' if we can't resolve the version
      acc[pkgName] = foundVersion || '*';
      return acc;
    }, {});
  }

  toJsonWithDir(options: WorkspaceManifestToJsonOptions = {}): { rootDir: string; manifest: Record<string, any> } {
    return {
      manifest: this.toJson(options),
      rootDir: this.rootDir,
    };
  }
}
