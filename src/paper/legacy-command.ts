import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import { Command } from './command';
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
    const options = LegacyCommand.createOptions();
    const element = await this.paperCommand.render(options);
    return render(element);
  }

  report(data: any, params: any, opts: { [key: string]: any }): string {
    return '';
  }

  static createOptions(): CommandOptions {
    return [] as CommandOptions;
  }
}
