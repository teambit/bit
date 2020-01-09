import R from 'ramda';
import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import { loadConsumer } from '../consumer';
import { Harmony } from '../harmony';
import Capsule from '../environment/capsule-builder';
import resolveExtensions from './extension-resolver';
import { CapsuleOptions } from 'orchestrator/types';

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

  async loadExtensions(capsule: Capsule) {
    if (this.config && this.workspace) {
      const extensionsIds = await resolveExtensions(this.config);
      const capsuleOptions: CapsuleOptions = {
        installPackages: true
      };
      const capsulesMap = await capsule.isolateComponents(this.workspace, extensionsIds, capsuleOptions);
      const extensions = R.mapObjIndexed(capsule => {
        const extPath = capsule.wrkDir;
        // console.log(extPath)
        const ext = require(extPath);
      }, capsulesMap);
      return extensions;
      // console.log(extensions)
    }
  }
}
