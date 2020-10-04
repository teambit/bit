import { ComponentMap } from '@teambit/component';
import {
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  DependenciesObjectDefinition,
  DependencyResolverMain,
  PackageManager,
  PackageManagerInstallOptions,
  PackageManagerResolveRemoteVersionOptions,
} from '@teambit/dependency-resolver';
import { ResolvedPackageVersion } from '@teambit/dependency-resolver/package-manager';
import { Logger } from '@teambit/logger';
import { PkgMain } from '@teambit/pkg';
import { join } from 'path';
import userHome from 'user-home';

const defaultStoreDir = join(userHome, '.pnpm-store');

export class PnpmPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverMain, private pkg: PkgMain, private logger: Logger) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { install } = require('./lynx');
    const storeDir = installOptions?.cacheRootDir ? join(installOptions?.cacheRootDir, '.pnpm-store') : defaultStoreDir;

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
    const rootManifest = workspaceManifest.toJson({
      includeDir: true,
      copyPeerToRuntime: installOptions.copyPeerToRuntimeOnRoot,
    });
    const componentsManifests = this.computeComponentsManifests(
      componentDirectoryMap,
      workspaceManifest.componentsManifestsMap,
      // In case of not deduping we want to install peers inside the components
      // !options.dedupe
      installOptions.copyPeerToRuntimeOnComponents
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

  async resolveRemoteVersion(
    packageName: string,
    options: PackageManagerResolveRemoteVersionOptions
  ): Promise<ResolvedPackageVersion> {
    // require it dynamically for performance purpose. the pnpm package require many files - do not move to static import
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { resolveRemoteVersion } = require('./lynx');
    const storeDir = options?.cacheRootDir ? join(options?.cacheRootDir, '.pnpm-store') : defaultStoreDir;
    return resolveRemoteVersion(packageName, options.rootDir, storeDir);
  }
}
