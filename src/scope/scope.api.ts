import { Consumer } from '../consumer';

// eslint-disable-next-line import/prefer-default-export
export class Scope {
  constructor(
    /**
     * legacy consumer
     */
    readonly consumer: Consumer
  ) {}

  /**
   * fetch component(s) from a remote Scope.
   */
  fetch() {}
}
