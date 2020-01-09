import { Consumer } from '../consumer';
import { Scope } from '../scope';
import { BitIds } from 'bit-id';

/**
 * API of the Bit Workspace
 */
export default class Workspace {
  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    private consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope = consumer.scope
  ) {}

  get config() {
    return this.consumer.config;
  }

  get path() {
    return this.consumer.getPath();
  }

  /**
   * This should be removed
   * TODO: temp until we expose all needed functionalities
   * @readonly
   * @memberof Workspace
   */
  get _consumer() {
    return this.consumer;
  }

  loadComponentsForCapsule(ids: BitIds) {
    return this.consumer.loadComponentsForCapsule(ids);
  }
}
