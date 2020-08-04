import { PackageManager } from './package-manager';
import { ComponentMap } from '../component/component-map';
import { DependenciesObjectDefinition } from './types';
import { PathAbsolute } from '../../utils/path';

export class DependencyInstaller {
  constructor(
    /**
     * package manager instance.
     */
    private packageManager: PackageManager,

    private cacheRootDir?: string | PathAbsolute
  ) {}

  async install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>
  ) {
    // TODO: the cache should be probably passed to the package manager constructor not to the install function
    await this.packageManager.install(rootDir, rootDepsObject, componentDirectoryMap, {
      cacheRootDir: this.cacheRootDir,
    });
    return componentDirectoryMap;
  }
}
