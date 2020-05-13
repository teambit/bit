import { Harmony, ExtensionManifest } from '@teambit/harmony';
import R from 'ramda';
import { Workspace, ResolvedComponent } from '../workspace';
import { Scope } from '../scope';
import { Config } from '../config';
import { UNABLE_TO_LOAD_EXTENSION, UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from '../../constants';
import legacyLogger from '../../logger/logger';
import { LogPublisher } from '../logger';
import { ExtensionConfigList } from '../../consumer/config';

export default class Core {
  constructor(
    readonly harmony: Harmony,

    readonly config: Config,

    private logger: LogPublisher,

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
   * Load all unloaded extensions (3rd party extensions) registered in the config file
   */
  async init(): Promise<void> {
    const extensions = this.config.extensions._filterLegacy();
    return this.loadExtensions(extensions);
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(extensions: ExtensionConfigList): Promise<void> {
    const extensionsIds = extensions.ids;
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = R.difference(extensionsIds, loadedExtensions);
    let resolvedExtensions: ResolvedComponent[] = [];
    if (this.workspace) {
      resolvedExtensions = await this.workspace.load(extensionsToLoad);
    } else if (this.scope) {
      // TODO: handle scope resolve here
    }
    return this.loadResolvedExtensions(resolvedExtensions);
  }

  private loadResolvedExtensions(resolvedExtensions: ResolvedComponent[]): Promise<void> {
    const manifests = resolvedExtensions.map(resolvedExtension => {
      const compId = resolvedExtension.component.id.toString();
      try {
        const manifest = resolvedExtension.require();
        manifest.name = compId;
        return manifest;
      } catch (e) {
        const warning = UNABLE_TO_LOAD_EXTENSION(compId);
        this.logger.warn(warning);
        legacyLogger.warn(`${warning} error: ${e.message}`);
        legacyLogger.silly(e.stack);
      }
      return undefined;
    });

    // Remove empty manifests as a result of loading issue
    const filteredManifests = manifests.filter(manifest => manifest);
    return this.loadExtensionsByManifests(filteredManifests);
  }

  private async loadExtensionsByManifests(extensionsManifests: ExtensionManifest[]) {
    try {
      await this.harmony.set(extensionsManifests);
    } catch (e) {
      const ids = extensionsManifests.map(manifest => manifest.name);
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.warn(warning);
      legacyLogger.warn(`${warning} error: ${e.message}`);
      legacyLogger.silly(e.stack);
    }
  }
}
