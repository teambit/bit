import { ReplaySubject } from 'rxjs';
import { filter, difference } from 'ramda';

import { Capsule } from '../capsule';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import { AnyExtension } from '../../harmony/types';
import { BitIds as ComponentIds, BitId as ComponentId } from '../../bit-id';
import { Harmony } from '../../harmony';

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
     * reference to capsule orchestrator.
     */
    private capsule: Capsule,

    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony<unknown>
  ) {}

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  async extensions(): Promise<string[]> {
    if (!this.config) return Promise.resolve([]);
    let rawExtensions = this.config.extensions || {};
    rawExtensions = filter(ext => !ext.__legacy, rawExtensions);
    return Object.keys(rawExtensions);
  }

  public onExtensionsLoaded = new ReplaySubject();

  /**
   * returns bit's configuration.
   */
  get config() {
    if (!this.workspace) return null;
    return this.workspace.config;
  }

  async loadExtensions() {
    const extensions = await this.resolveExtensions();
    await this.harmony.set(extensions);
  }

  /**
   * load all of bit's extensions.
   * :TODO must be refactored by @gilad
   */
  private async resolveExtensions(): Promise<AnyExtension[]> {
    if (this.config && this.workspace) {
      const extensionsIds = await this.extensions();

      if (!extensionsIds || !extensionsIds.length) {
        return [];
      }
      const allRegisteredExtensionIds = this.harmony.extensionsIds;
      const nonRegisteredExtensions = difference(extensionsIds, allRegisteredExtensionIds);
      const extensionsComponents = await this.workspace.getMany(nonRegisteredExtensions);
      const capsulesMap = await this.capsule.create(extensionsComponents, { packageManager: 'npm' });

      return capsulesMap.map(({ value }) => {
        const extPath = value.wrkDir;
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(extPath);
        return mod;
      });
    }

    return [];
  }
}
