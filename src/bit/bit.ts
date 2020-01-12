import { CapsuleOptions } from '../orchestrator/types';
import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Capsule from '../environment/capsule-builder';
import resolveExtensions from './extension-resolver';
import { AnyExtension } from '../harmony/types';

export default class Bit {
  constructor(
    /**
     * Scope
     */
    readonly scope: Scope,

    /**
     * Workspace
     */
    readonly workspace: Workspace | null
  ) {}

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  /**
   *
   */
  get config() {
    if (!this.workspace) return null;
    return this.workspace.config;
  }

  async loadExtensions(capsule: Capsule): AnyExtension[] {
    if (this.config && this.workspace) {
      const extensionsIds = await resolveExtensions(this.config);
      const capsuleOptions: CapsuleOptions = {
        installPackages: true
      };
      const capsulesMap = await capsule.isolateComponents(this.workspace, extensionsIds, capsuleOptions);

      return Object.values(capsulesMap).map(capsule => {
        const extPath = capsule.wrkDir;
        return require(extPath);
      });
    }
  }
}
