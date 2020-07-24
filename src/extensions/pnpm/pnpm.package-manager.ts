import { join } from 'path';
import { install } from './lynx';
import { PackageManager, InstallationStream } from '../dependency-resolver/package-manager';
import { ComponentMap } from '../component/component-map';
import { Component, ComponentID } from '../component';
import { DependencyResolverExtension } from '../dependency-resolver';
import { PkgExtension } from '../pkg';

const userHome = require('user-home');
// better to use the workspace name here.
const ROOT_NAME = 'workspace';

export class PnpmPackageManager implements PackageManager {
  constructor(
    private depResolver: DependencyResolverExtension,

    private pkg: PkgExtension
  ) {}

  async install(rootDir: string, componentDirectoryMap: ComponentMap<string>): Promise<InstallationStream> {
    const storeDir: string = join(userHome, '.pnpm-store');

    const workspace = {
      rootDir,
      manifest: {
        // not relevant
        name: ROOT_NAME,
        // not relevant
        version: '1.0.0',
        dependencies: this.listWorkspaceDependencies(componentDirectoryMap),
      },
    };

    const components = this.computeManifests(componentDirectoryMap, rootDir);

    return install(workspace, components, storeDir);
  }

  private computeManifests(componentDirectoryMap: ComponentMap<string>, rootDir: string) {
    return componentDirectoryMap.toArray().reduce((acc, [component, dir]) => {
      acc[join(rootDir, dir)] = {
        name: this.pkg.getPackageName(component),
        version: this.getVersion(component.id),
        ...this.computeDependencies(component, rootDir),
      };

      return acc;
    }, {});
  }

  private computeDependencies(component: Component, rootDir: string) {
    return this.depResolver.getDependencies(component).toJson(rootDir);
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
