import { Network } from '../network';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import { ExtensionConfigList } from '../workspace-config/extension-config-list';

export default class Bit {
  constructor(
    /**
     * Scope
     */
    readonly scope: Scope | undefined,

    /**
     * Workspace
     */
    readonly workspace: Workspace | undefined,

    /**
     * reference to capsule network.
     */
    private network: Network
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
  get config() {
    if (!this.workspace) return null;
    return this.workspace.config;
  }
}
