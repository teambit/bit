import { slot, Slot } from '@teambit/harmony';
import { Paper, Command } from '../paper';

export class BitCli {
  constructor(
    /**
     * bit's legacy command registry
     */
    readonly paper: Paper
  ) {}

  /**
   * slot for adding new commands.
   */
  @slot commands = Slot.create<Command>();

  /**
   * lists all registered commands
   */
  list() {
    return this.commands.list();
  }

  /**
   * execute bit's cli
   */
  run() {
    this.registerAll();
    return this.paper.run();
  }

  register(command: Command) {
    return this.paper.register(command);
  }

  private registerAll() {
    const commands = this.list();
    commands.forEach(command => this.register(command));
    return this;
  }
}
