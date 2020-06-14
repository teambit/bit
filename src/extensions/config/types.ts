import { PathOsBased } from '../../utils/path';
import { ExtensionConfigList, ExtensionConfigEntry } from '../../consumer/config';

/**
 * An interface implemented by component host (workspace / scope) config file
 * This used to be able to abstract the workspace/scope config.
 */
export interface HostConfig {
  /**
   * Path to the actual file
   */
  path: PathOsBased;

  extensions: ExtensionConfigList;

  extension: (extensionId: string, ignoreVersion: boolean) => ExtensionConfigEntry;
}

export type ConfigType = 'workspace' | 'scope';
