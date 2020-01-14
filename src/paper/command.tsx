import { CommandOptions } from '../cli/command';

export interface Command {
  /**
   * the name of the command. for example: 'add <> []'
   */
  name: string;

  /**
   * the description of the command. Will be seen in bit help and command help.
   * Examples:
   *  1. `bit`
   *  2. `bit add --help`
   */
  description: string;

  /**
   * command alias (for example: 't' for 'tag')
   */
  alias: string;

  /**
   * array of command options.
   */
  opts: PaperOptions;

  /**
   *
   * @param args command options provided in CLI
   *
   */
  render:(params:PaperOptions, opts?:any) => Promise<React.ReactElement>;
}

export type PaperOptions = CommandOptions
