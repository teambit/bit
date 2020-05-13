import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { Scope } from '../scope';
import { Config } from '../config';
import { LogPublisher } from '../logger';
import { ExtensionConfigList } from '../../consumer/config';
import { ComponentHost } from '../types';

export default class Core {
  host: ComponentHost;

  constructor(
    readonly harmony: Harmony,

    readonly config: Config | undefined,

    private logger: LogPublisher,

    /**
     * Scope
     */
    readonly scope: Scope | undefined,

    /**
     * Workspace
     */
    readonly workspace: Workspace | undefined
  ) {
    if (workspace) {
      this.host = workspace;
    } else if (scope) {
      this.host = scope;
    }
  }

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  /**
   * Load all unloaded extensions (3rd party extensions) registered in the config file
   */
  async init(): Promise<void> {
    if (this.config) {
      const extensions = this.config.extensions._filterLegacy();
      return this.loadExtensions(extensions);
    }
    return undefined;
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionConfigList): Promise<void> {
    return this.host.loadExtensions(extensions);
  }
}
