import { PathOsBased } from '../../utils/path';
import { ExtensionDataList, ExtensionDataEntry } from '../../consumer/config';

/**
 * An interface implemented by component host (workspace / scope) config file
 * This used to be able to abstract the workspace/scope config.
 */
export interface HostConfig {
  /**
   * Path to the actual file
   */
  path: PathOsBased;

  extensions: ExtensionDataList;

  extension: (extensionId: string, ignoreVersion: boolean) => ExtensionDataEntry;
}

export type ConfigType = 'workspace' | 'scope';
