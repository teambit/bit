import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathLinuxRelative, PathOsBasedRelative } from '@teambit/legacy.utils';

/**
 * in-memory representation of the component configuration.
 */
export class Config {
  constructor(private consumerComponent: any) {}

  /**
   * component main file
   * when loaded from the workspace, it's PathOsBasedRelative. otherwise, PathLinuxRelative.
   */
  get main(): PathLinuxRelative | PathOsBasedRelative {
    return this.consumerComponent.mainFile;
  }

  /**
   * configured extensions
   */
  get extensions(): ExtensionDataList {
    return this.consumerComponent.extensions;
  }
}
