import type { ConfigWriterList } from './config-writer-list';

export interface WorkspaceConfigEnv {
  /**
   * return a ConfigWriterList instance.
   */
  workspaceConfig?(): ConfigWriterList;
}
