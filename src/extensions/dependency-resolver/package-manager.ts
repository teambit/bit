import { ComponentMap } from '../component/component-map';
import { DependenciesObjectDefinition } from './types';

export interface PackageManager {
  /**
   * install dependencies
   * @param componentDirectoryMap
   */
  install(
    rootDir: string,
    rootDepsObject: DependenciesObjectDefinition,
    componentDirectoryMap: ComponentMap<string>
  ): Promise<void>;
}
