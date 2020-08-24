import { ComponentMap } from '@teambit/component';
import {
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  DependenciesObjectDefinition,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
} from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { PkgMain } from '@teambit/pkg';
import { join } from 'path';
import userHome from 'user-home';

export class PnpmPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain, private logger: Logger) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');
    const storeDir = installOptions?.cacheRootDir
      ? join(installOptions?.cacheRootDir, '.pnpm-store')
      : join(userHome, '.pnpm-store');

    const components = componentDirectoryMap.toArray().map(([component]) => component);
    const options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
      dedupe: installOptions.dedupe,
    };
    const workspaceManifest = await this.depResolver.getWorkspaceManifest(
      undefined,
      undefined,
      rootDepsObject,
      rootDir,
      components,
      options
    );
    const rootManifest = workspaceManifest.toJson({ includeDir: true, copyPeerToRuntime: true });
    const componentsManifests = this.computeComponentsManifests(
      componentDirectoryMap,
      workspaceManifest.componentsManifestsMap,
      // In case of not deduping we want to install peers inside the components
      !options.dedupe
    );
    this.logger.debug('root manifest for installation', rootManifest);
    this.logger.debug('components manifests for installation', componentsManifests);
    this.logger.setStatusLine('installing dependencies');
    await install(rootManifest, componentsManifests, storeDir);
    this.logger.consoleSuccess('installing dependencies');
  }

  private computeComponentsManifests(
    componentDirectoryMap: ComponentMap<string>,
    componentsManifestsFromWorkspace: ComponentsManifestsMap,
    copyPeerToRuntime = false
  ) {
    return componentDirectoryMap.toArray().reduce((acc, [component, dir]) => {
      const packageName = this.pkg.getPackageName(component);
      if (componentsManifestsFromWorkspace.has(packageName)) {
        acc[dir] = componentsManifestsFromWorkspace.get(packageName)?.toJson({ copyPeerToRuntime });
      }
      return acc;
    }, {});
  }
}
