// TODO: remove this
import { CommandOptions } from '../../cli/command';

export interface Command {
  /**
   * Name of command with arguments:
   * <> for mandatory arguments.
   * [] for optional arguments.
   * 'bit add <path>'
   */
  name: string;

  /**
   * command alias (for example: 't' for 'tag')
   */
  alias?: string;
  /**
   * Description of the command in commands summery
   * `bit -h`
   * `bit`
   */
  shortDescription?: string;

  /**
   * The description of the command. Will be seen in bit command help .
   *  `bit add --help`
   */
  description?: string;

  /**
   *  allow grouping of commands to hint summery renderer
   *  Places in default automatic help
   */
  group?: string;

  /**
   *  Should a command be exposed to the user.
   */
  private?: boolean;

  /**
   * should turn on Loader
   */
  loader?: boolean;

  /**
   * Array of command options where each element is a tuple.
   * ['shorten flag', 'long flag', 'flag description']
   * for example:
   * ['j', 'json', 'output json command']
   *
   */
  options?: PaperOptions;

  /**
   * sub commands for example:
   * bit capsule list to list active capsules.
   */
  commands?: Command[];

  /**
   * Main command handler which is called when invoking commands
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return - JSX element which is rendered with ink
   */
  render: (args: CLIArgs, flags: Flags) => Promise<React.ReactElement>;

  /**
   * Optional handler to provide a raw result of the command.
   * Will be go called if '-j' option is provided by user.
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return a GenericObject to be rendered to string in the console.
   */

  json?: (args: CLIArgs, flags: Flags) => GenericObject;
}
export type Flags = { [flagName: string]: string | string[] | boolean | undefined };
export type CLIArgs = Array<string[] | string>;
export type GenericObject = { [k: string]: any };
export type PaperOptions = CommandOptions;
