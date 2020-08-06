import { ComponentMap } from '../component/component-map';
import { DependenciesObjectDefinition } from './types';

export type PackageManagerInstallOptions = {
  cacheRootDir?: string;
};

export interface PackageManager {
  /**
   * install dependencies
   * @param componentDirectoryMap
   */
  install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>,
    options?: PackageManagerInstallOptions
  ): Promise<void>;
}
