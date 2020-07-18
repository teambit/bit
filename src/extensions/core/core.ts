import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { ScopeExtension } from '../scope';
import { Config } from '../config';
import { LogPublisher } from '../logger';
import { ExtensionDataList } from '../../consumer/config';
import { ComponentHost } from '../types';
import { ExtensionDescriptor } from './extension-descriptor';

export default class Core {
  host: ComponentHost;

  constructor(
    readonly harmony: Harmony,

    readonly config: Config | undefined,

    private logger: LogPublisher,

    /**
     * Scope
     */
    readonly scope: ScopeExtension,

    /**
     * Workspace
     */
    readonly workspace: Workspace | undefined
  ) {
    if (workspace) {
      this.host = workspace;
    } else {
      // TODO: implement the ComponentHost interface by scope (then remove the ts-ignore)
      // @ts-ignore
      this.host = scope;
    }
  }

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  getDescriptor(id: string): ExtensionDescriptor {
    const instance = this.harmony.get<any>(id);
    const iconFn = instance.icon;
    const defaultIcon = `
      <svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
          <circle cx="25" cy="25" r="20"/>
      </svg>`;

    const icon = iconFn ? iconFn() : defaultIcon;

    return {
      id,
      icon,
    };
  }

  /**
   * Load all unloaded extensions (3rd party extensions) registered in the config file
   */
  async init(): Promise<void> {
    if (this.config && this.config.extensions) {
      const extensions = this.config.extensions._filterLegacy();
      return this.loadExtensions(extensions);
    }
    return undefined;
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionDataList): Promise<void> {
    // TODO: remove this condition once scope implements ComponentHost
    if (this.host && this.host.loadExtensions) {
      return this.host.loadExtensions(extensions);
    }
    return undefined;
  }
}
