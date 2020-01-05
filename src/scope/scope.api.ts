import { Consumer } from '../consumer';

// eslint-disable-next-line import/prefer-default-export
export class Scope {
  constructor(
    /**
     * legacy consumer
     */
    private consumer: Consumer
  ) {}

  fetch() {}
}
