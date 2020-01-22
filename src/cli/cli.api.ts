import { Paper } from '../paper';

export default class BitCli {
  constructor(
    /**
     * bit's legacy command registry
     */
    readonly paper: Paper
  ) {}

  /**
   * execute bit's cli
   */
  run() {
    return this.paper.run();
  }
}
