import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import { Command } from '../paper/command';
import { render } from 'ink';

/**
 * Legacy Commands is paper command wrapper in order to be run by the legacy command registry.
 *
 */
export default class LegacyCommand extends Cmd {
  constructor(private paperCommand: Command) {
    super();
    this.name = paperCommand.name;
    this.description = paperCommand.description;
    this.opts = paperCommand.opts;
    this.alias = paperCommand.alias;
  }

  async action(params: any, opts: { [key: string]: any }, packageManagerArgs: string[]): Promise<any> {
    const element = await this.paperCommand.render(params);
    return render(element);
  }

  report(data: any, params: any, opts: { [key: string]: any }): string {
    return '';
  }
}
