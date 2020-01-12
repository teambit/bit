import { CommandOptions } from '../cli/command';
import LegacyCommand from './legacy-command';

export default class Command {
  constructor(
    /**
     * the name of the command. for example: 'add <> []'
     */
    readonly name: string,

    /**
     * the descriotion of the command. will be seen in 
     */
    readonly description: string,

    /**
     * command alias (for example: 't' for 'tag')
     */
    readonly alias: string,

    /**
     * array of command options.
     */
    readonly opts: CommandOptions
  ) {}

  render() {
  }

  toLegacyFormat() {
    return new LegacyCommand(this);
  }
}
