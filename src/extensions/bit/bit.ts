import { ReplaySubject } from 'rxjs';
import { filter, difference } from 'ramda';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import { Capsule } from '../capsule';
import { AnyExtension } from '../../harmony/types';
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

  async extensions(): Promise<{ [extensionId: string]: any }> {
    if (!this.config) return Promise.resolve({});
    let rawExtensions = this.config.extensions || {};
    rawExtensions = filter(ext => !ext.__legacy, rawExtensions);
    return rawExtensions;
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
    const { extensionsManifests, extensionsConfig } = await this.resolveExtensions();
    await this.harmony.set(extensionsManifests, extensionsConfig);
  }

  /**
   * load all of bit's extensions.
   * :TODO must be refactored by @gilad
   */
  private async resolveExtensions(): Promise<{
    extensionsManifests: AnyExtension[];
    extensionsConfig: { [extensionId: string]: any };
  }> {
    const result = {
      extensionsManifests: [],
      extensionsConfig: {}
    };
    if (this.config && this.workspace) {
      const extensionsConfig = await this.extensions();
      const extensionsIds = Object.keys(extensionsConfig);

      if (!extensionsIds || !extensionsIds.length) {
        return result;
      }
      const allRegisteredExtensionIds = this.harmony.extensionsIds;
      const nonRegisteredExtensions = difference(extensionsIds, allRegisteredExtensionIds);
      // nonRegisteredExtensions.forEeach(extId => this.harmony.setExtensionConfig(extId, extensions[extId]))
      const extensionsComponents = await this.workspace.getMany(nonRegisteredExtensions);
      const capsuleList = await this.capsule.create(extensionsComponents);

      const manifests = capsuleList.map(({ value }) => {
        const extPath = value.wrkDir;
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(extPath);
        return mod;
      });
      // @ts-ignore
      result.extensionsManifests = manifests;
      result.extensionsConfig = extensionsConfig;
    }

    return result;
  }
}
