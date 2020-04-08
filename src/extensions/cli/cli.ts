import { Hook, hook, Extension } from '@teambit/harmony';
import { PaperExt, Command, Paper } from '../paper';
import { CLIProvider } from './cli.provider';

@Extension({
  dependencies: [PaperExt]
})
export class BitCli {
  /**
   * hook for registring new CLI events
   */
  @hook commands = Hook.create<Command>();

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

  static provider([paper]: [Paper]) {
    return CLIProvider([paper]);
  }
}
