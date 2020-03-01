import { ReplaySubject } from 'rxjs';
import { filter, difference } from 'ramda';

import { Capsule } from '../capsule';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import { AnyExtension } from '../../harmony';
import { Harmony } from '../../harmony';
import { ExtensionConfigList } from '../workspace-config/extension-config-list';
import { MissingBitMapComponent } from '../../consumer/bit-map/exceptions';
import GeneralError from '../../error/general-error';

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

  async extensions(): Promise<ExtensionConfigList> {
    if (!this.config) return Promise.resolve(ExtensionConfigList.fromArray([]));
    const extensionsConfig = this.config.workspaceSettings.extensionsConfig;
    const newExtensions = extensionsConfig._filterLegacy();
    return newExtensions;
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
      const extensionsIds = extensionsConfig.ids;

      if (!extensionsIds || !extensionsIds.length) {
        return result;
      }
      const allRegisteredExtensionIds = this.harmony.extensionsIds;
      const nonRegisteredExtensions = difference(extensionsIds, allRegisteredExtensionIds);
      // nonRegisteredExtensions.forEeach(extId => this.harmony.setExtensionConfig(extId, extensions[extId]))
      let extensionsComponents;
      // TODO: improve this, instead of catching an error, add some api in workspace to see if something from the list is missing
      try {
        extensionsComponents = await this.workspace.getMany(nonRegisteredExtensions);
      } catch (e) {
        if (e instanceof MissingBitMapComponent) {
          throw new GeneralError(`could not find an extension "${e.id}" defined in the workspace config`);
        }
      }
      const capsuleList = await this.capsule.create(extensionsComponents, { packageManager: 'yarn' });

      const manifests = capsuleList.map(({ value, id }) => {
        const extPath = value.wrkDir;
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(extPath);
        mod.name = id.toString();
        return mod;
      });
      // @ts-ignore
      result.extensionsManifests = manifests;
      result.extensionsConfig = extensionsConfig.toObject();
    }

    return result;
  }
}
