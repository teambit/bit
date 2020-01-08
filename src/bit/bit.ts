import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import { loadConsumer } from '../consumer';
import { Harmony } from '../harmony';

export default class Bit {
  constructor(readonly scope: Scope, readonly workspace: Workspace | null) {}

  /**
   * bit's current version
   */
  get version() {
    return '1.0.0';
  }

  get config() {
    if (!this.workspace) return null;
    return this.workspace.config;
  }
}
