import { join } from 'path';
import { install } from './lynx';
// import { logConverter } from './log-converter';
import { PackageManager } from '../dependency-resolver/package-manager';
import { ComponentMap } from '../component/component-map';
import { Component, ComponentID } from '../component';
import { DependencyResolverExtension } from '../dependency-resolver';
import { PkgExtension } from '../pkg';
import { LogPublisher } from '../logger';

const userHome = require('user-home');
// better to use the workspace name here.
const ROOT_NAME = 'workspace';

export class PnpmPackageManager implements PackageManager {
  constructor(
    private depResolver: DependencyResolverExtension,
    private pkg: PkgExtension,
    private logger: LogPublisher
  ) {}

  async install(rootDir: string, componentDirectoryMap: ComponentMap<string>): Promise<void> {
    const storeDir: string = join(userHome, '.pnpm-store');
    // TODO: @gilad please fix asap and compute deps with the new dep resolver.
    let packageJson;

    try {
      // eslint-disable-next-line
      packageJson = require(join(rootDir, 'package.json'));
    } catch (err) {
      packageJson = { dependencies: {}, devDependencies: {} };
    }

    const workspace = {
      rootDir,
      manifest: {
        // not relevant
        name: ROOT_NAME,
        // not relevant
        version: '1.0.0',
        dependencies: {
          ...this.listWorkspaceDependencies(componentDirectoryMap),
          ...packageJson.dependencies,
        },
        devDependencies: {
          ...packageJson.devDependencies,
        },
      },
    };

    const components = this.computeManifests(componentDirectoryMap, rootDir);
    await install(workspace, components, storeDir);
  }

  private computeManifests(componentDirectoryMap: ComponentMap<string>, rootDir: string) {
    return componentDirectoryMap.toArray().reduce((acc, [component, dir]) => {
      acc[join(rootDir, dir)] = {
        name: this.pkg.getPackageName(component),
        version: this.getVersion(component.id),
        ...this.computeDependencies(component),
      };

      return acc;
    }, {});
  }

  private computeDependencies(component: Component) {
    return this.depResolver.getDependencies(component).toJson();
  }

  private getVersion(id: ComponentID): string {
    if (!id.hasVersion()) return '0.0.1-new';
    return id.version as string;
  }

  private listWorkspaceDependencies(componentDirectoryMap: ComponentMap<string>) {
    return componentDirectoryMap.toArray().reduce((acc, [component]) => {
      acc[this.pkg.getPackageName(component)] = `${ROOT_NAME}:${this.getVersion(component.id)}`;
      return acc;
    }, {});
  }
}
