import { ExtensionDataEntry, ExtensionDataList } from 'bit-bin/dist/consumer/config';
import { PathOsBased } from 'bit-bin/dist/utils/path';

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
