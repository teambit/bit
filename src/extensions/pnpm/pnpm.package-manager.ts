import { join } from 'path';
import lynx from './lynx';
import { PackageManager, InstallationStream } from '../dependency-resolver/package-manager';
import { ComponentMap } from '../component/component-map';
import { Component, ComponentID } from '../component';
import { DependencyResolverExtension } from '../dependency-resolver';

// better to use the workspace name here.
const ROOT_NAME = 'root';

export class PnpmPackageManager implements PackageManager {
  constructor(private depResolver: DependencyResolverExtension) {}

  async install(rootDir: string, componentDirectoryMap: ComponentMap<string>): Promise<InstallationStream> {
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

    await lynx(workspace, components, rootDir);
  }

  private computeManifests(componentDirectoryMap: ComponentMap<string>, rootDir: string) {
    return componentDirectoryMap.toArray().reduce((acc, [component, dir]) => {
      acc[join(rootDir, dir)] = {
        name: component.id.fullName,
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
      acc[component.id.fullName] = `${ROOT_NAME}:${this.getVersion(component.id)}`;
      return acc;
    }, {});
  }
}
