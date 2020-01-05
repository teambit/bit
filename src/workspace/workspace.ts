import { Consumer } from '../consumer';
import { Scope } from '../scope';

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
}
