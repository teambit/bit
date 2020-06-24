import { CommandOptions } from './legacy-command';

export interface Command {
  /**
   * Name of command with arguments:
   * <> for mandatory arguments.
   * [] for optional arguments.
   * e.g. 'add <path>'
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
   * The description of the command. Will be seen in bit command help.
   * `bit add --help`
   */
  description?: string;

  /**
   * allow grouping of commands to hint summery renderer
   * Places in default automatic help
   */
  group?: string;

  /**
   * Should a command be exposed to the user.
   */
  private?: boolean;

  /**
   * should turn on Loader
   */
  loader?: boolean;

  /**
   * Array of command options where each element is a tuple.
   * ['flag alias', 'flag name', 'flag description']
   * for example:
   * ['j', 'json', 'output json format']
   */
  options: CommandOptions;

  /**
   * sub commands for example:
   * bit capsule list to list active capsules.
   */
  commands?: Command[];

  /**
   * command running on a remote ssh server, such as, _fetch, _put.
   * for now, the only difference is that they get a "token" flag to authenticate anonymously.
   */
  remoteOp?: boolean;

  /**
   * do not set this. it is being set once the command run.
   * the values are those followed `--` in the command line. (e.g. `bit import -- --no-optional`)
   */
  _packageManagerArgs?: string[];

  /**
   * Main command handler which is called when invoking new commands
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return - JSX element which is rendered with ink
   */
  render?(args: CLIArgs, flags: Flags): Promise<React.ReactElement>;

  /**
   * Command handler which is called for legacy commands or when process.isTTY is false
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return - Report object. The Report.data is printed to the stdout as is.
   */
  report?(args: CLIArgs, flags: Flags): Promise<string | Report>;

  /**
   * Optional handler to provide a raw result of the command.
   * Will be go called if '-j'/'--json' option is provided by user.
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return a GenericObject to be rendered to string (by json.stringify) in the console.
   */
  json?(args: CLIArgs, flags: Flags): Promise<GenericObject>;
}
export type Flags = { [flagName: string]: string | boolean | undefined };
export type CLIArgs = Array<string[] | string>;
export type GenericObject = { [k: string]: any };
export type Report = { data: string; code: number };
