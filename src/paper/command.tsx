import { CommandOptions } from '../cli/command';

export interface Command {
  /**
   * Name of command with arguments:
   * <> for mandatory arguments.
   * [] for optional arguments.
   * 'bit add <path>'
   */
  name: string;

  /**
   * The description of the command. Will be seen in bit command help .
   *  `bit add --help`
   */
  description: string;

  /**
   * should turn on Loader
   */
  loader?: boolean

  /**
   * Description of the command in commands summery
   * `bit -h`
   * `bit`
   */
  shortDescription: string;

  /**
   *  allow grouping of commands to hint summery renderer
   */

  group:string

   /**
   * command alias (for example: 't' for 'tag')
   */
  alias: string;

  /**
   * Array of command options where each element is a tuple.
   * ['shorten flag', 'long flag', 'flag description']
   * for example:
   * ['j', 'json', 'output json command']
   *
   */
  options: PaperOptions;
  commands?: Command[]

  /**
   *  Should a command be exposed to the user.
   */
  private?:boolean

  /**
   * Main command handler which is called when invoking commands
   * @param params  - arguments object as defined in name.
   * @param options - command flags as described in options.
   * @return - JSX element which is rendered with ink
   */
  render: (params: any, options: { [key: string]: any }) => Promise<React.ReactElement>;
  /**
   * Optional handler to provide a raw result of the command.
   * Will be go called if '-j' option is provided by user.
   * @param params  - arguments object as defined in name.
   * @param options - command flags as described in options.
   * @return a GenericObject to be rendered to string in the console.
   */
  json?: (params: any, options: { [key: string]: any }) => GenericObject;
}

export type GenericObject = { [k: string]: any };
export type PaperOptions = CommandOptions;
