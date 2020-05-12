import { PathOsBased } from '../../utils/path';

/**
 * An interface implemented by component host (workspace / scope) config file
 * This used to be able to abstract the workspace/scope config.
 */
export interface HostConfig {
  /**
   * Path to the actual file
   */
  path: PathOsBased;
}

export type ConfigType = 'workspace' | 'scope';
