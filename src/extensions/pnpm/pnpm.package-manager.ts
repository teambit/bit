import { join } from 'path';
import { install } from './lynx';
import { PackageManager, PackageManagerInstallOptions } from '../dependency-resolver';
import { ComponentMap } from '../component/component-map';
import {
  DependencyResolverExtension,
  ComponentsManifestsMap,
  CreateFromComponentsOptions,
  DependenciesObjectDefinition,
} from '../dependency-resolver';
import { PkgExtension } from '../pkg';
import { Logger } from '../logger';

const userHome = require('user-home');

export class PnpmPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverExtension, private pkg: PkgExtension, private logger: Logger) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    installOptions: PackageManagerInstallOptions = {}
  ): Promise<void> {
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
    delete rootManifest.manifest.dependencies['bit-bin'];
    delete rootManifest.manifest.peerDependencies['bit-bin'];
    Object.keys(componentsManifests).forEach((componentName) => {
      if (!componentsManifests[componentName].dependencies) return;
      delete componentsManifests[componentName].dependencies['bit-bin'];
    });
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
