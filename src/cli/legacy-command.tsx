import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import { Command } from '../paper/command';
import { render, Color } from 'ink';
import React from 'react';

/**
 * Legacy Commands is paper command wrapper in order to be run by the legacy command registry.
 *
 */
export class LegacyCommand extends Cmd {
  constructor(private paperCommand: Command) {
    super();
    this.name = paperCommand.name;
    this.description = paperCommand.description;
    this.opts = paperCommand.opts;
    this.alias = paperCommand.alias;
  }

  async action(params: any, opts: { [key: string]: any }, packageManagerArgs: string[]): Promise<any> {
    if (opts.json) {
      const element = await this.paperCommand.render(params, opts)
      render(element)
    } else {
      const json = await this.paperCommand.json!(params, opts)
      console.log(JSON.stringify(json,null, 2))
    }
  }
  report(data: any, params: any, opts: { [key: string]: any }): string {
    return '';
  }

}
