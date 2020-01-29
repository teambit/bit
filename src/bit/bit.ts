import { ReplaySubject } from 'rxjs';
import { CapsuleOptions } from '../capsule/orchestrator/types';
import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import { Capsule } from '../capsule';
import { AnyExtension } from '../../extensions/harmony/types';
import { BitIds as ComponentIds, BitId as ComponentId } from '../bit-id';
import { Harmony } from '../../extensions/harmony';

export default class Bit {
  constructor(
    /**
     * Scope
     */
    readonly scope: Scope,

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
    private harmony: Harmony
  ) {}

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  async extensions(): Promise<ComponentId[]> {
    if (!this.config) return Promise.resolve([]);

    return ComponentIds.deserializeObsolete(Object.keys(this.config.extensions));
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
    await this.harmony.load(extensions);
  }

  /**
   * load all of bit's extensions.
   * :TODO must be refactored by @gilad
   */
  private async resolveExtensions(): Promise<AnyExtension[]> {
    if (this.config && this.workspace) {
      const extensionsIds = await this.extensions();
      const capsuleOptions: CapsuleOptions = {
        installPackages: true
      };
      const capsulesMap = await this.capsule.legacyBuilder.isolateComponents(
        extensionsIds.map(ex => ex.toString()),
        capsuleOptions
      );

      return Object.values(capsulesMap).map(capsule => {
        const extPath = capsule.wrkDir;
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(extPath);
      });
    }

    return [];
  }
}
