import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import { WorkspaceConfig } from '../workspace-config';

export default class Bit {
  constructor(
    /**
     * Scope
     */
    readonly scope: Scope | undefined,

    /**
     * Workspace
     */
    readonly workspace: Workspace | undefined
  ) {}

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  /**
   * returns bit's configuration.
   */
  get config(): WorkspaceConfig | null {
    if (!this.workspace) return null;
    return this.workspace.config;
  }
}
