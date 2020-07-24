import { ComponentMap } from '../component/component-map';

export type InstallationStream = {};

export interface PackageManager {
  /**
   * install dependencies
   * @param componentDirectoryMap
   */
  install(rootDir: string, componentDirectoryMap: ComponentMap<string>): Promise<InstallationStream>;
}
