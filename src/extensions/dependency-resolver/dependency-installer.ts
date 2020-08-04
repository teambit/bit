import { PackageManager } from './package-manager';
import { ComponentMap } from '../component/component-map';
import { DependenciesObjectDefinition } from './types';

export class DependencyInstaller {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager
  ) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>
  ) {
    await this.packageManager.install(rootDir, rootDepsObject, componentDirectoryMap);
    return componentDirectoryMap;
  }
}
