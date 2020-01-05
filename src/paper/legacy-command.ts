import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import Command from './command';

export default class LegacyCommand extends Cmd {
  constructor(private newCommand: Command) {
    super();
    this.name = newCommand.name;
    this.description = newCommand.description;
    this.opts = newCommand.opts;
    this.alias = newCommand.alias;
  }

  // action(args: any, options: {[key: string]: any}, packageManagerArgs: string[]) {
  //   this.newCommand.render(args);
  // }
}
