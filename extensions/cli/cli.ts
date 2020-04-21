import { Paper, Command } from '@bit/bit.core.paper';

export class BitCli {
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

  register(command: Command) {
    return this.paper.register(command);
  }
}
