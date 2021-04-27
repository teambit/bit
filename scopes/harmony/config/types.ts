import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';

import { SetExtensionOptions } from './config';

export type WriteOptions = {
  dir?: PathOsBasedAbsolute;
};

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

  setExtension(extensionId: string, config: Record<string, any>, options: SetExtensionOptions): void;

  write(opts: WriteOptions): Promise<void>;
}

export type ConfigType = 'workspace' | 'scope';
