import type { Group } from './command-groups';

type CommandOption = [string, string, string];
export type CommandOptions = Array<CommandOption>;

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
   * The description of the command. Being used in the commands summery (`bit --help`) and the help (e.g. `bit create --help`).
   * should be short and precise. not more than one line. (use extendedDescription for more info).
   */
  description: string;

  /**
   * The extended description of the command. Will be seen in only in the command help, just after the description.
   */
  extendedDescription?: string;

  /**
   * url to a doc page explaining the command. shown in the command help just after the extendedDescription.
   * if a relative url is entered, the base url will be retrieved from `teambit.community/community` aspect.
   */
  helpUrl?: string;

  /**
   * allow grouping of commands to hint summery renderer
   * Places in default automatic help
   */
  group?: Group | string;

  /**
   * should a command be exposed to the user (by bit help).
   * e.g. experimental or plumbing commands should be hidden.
   */
  private?: boolean;

  /**
   * should turn on Loader.
   * the default is false for internal-commands and true for others.
   * @see cliMain.setDefaults()
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
   * arguments are defined in the "name" property, and that's where the source of truth is.
   * this prop is optional and provides a way to describe the args. later, it'll support more fields, such as defaultValue.
   * if this is set, it'll be shown in the command help under "Arguments" section.
   */
  arguments?: CommandArg[];

  /**
   * sub commands for example:
   * bit capsule list to list active capsules.
   */
  commands?: Command[];

  /**
   * interact with a remote, e.g. "export" push to a remote
   * for now, the only difference is that they get a "token" flag to authenticate anonymously.
   */
  remoteOp?: boolean;

  /**
   * if true, it indicates that it doesn't need the workspace to work and can be executed outside a
   * workspace
   */
  skipWorkspace?: boolean;

  /**
   * optionally, give some examples how to use the command.
   */
  examples?: Example[];

  /**
   * whether to load aspects set in workspace.jsonc before running the command.
   * default is true.
   */
  loadAspects?: boolean;

  /**
   * do not set this. it is being set once the command run.
   * the values are those followed `--` in the command line. (e.g. `bit import -- --no-optional`)
   */
  _packageManagerArgs?: string[];

  /**
   * Command handler which prints the return value to the console and exits.
   * If the command has both, `render` and `report`, this one will be called when process.isTTY is false.
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return - Report object. The Report.data is printed to the stdout as is.
   */
  report?(args: CLIArgs, flags: Flags): Promise<string | Report>;

  /**
   * Command handler which never exits the process
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   */
  wait?(args: CLIArgs, flags: Flags): Promise<void>;

  /**
   * Optional handler to provide a raw result of the command.
   * Will be go called if '-j'/'--json' option is provided by user.
   * @param args  - arguments object as defined in name.
   * @param flags - command flags as described in options.
   * @return a GenericObject to be rendered to string (by json.stringify) in the console.
   */
  json?(args: CLIArgs, flags: Flags): Promise<GenericObject>;
}
export type Flags = { [flagName: string]: string | boolean | undefined | any };
export type CLIArgs = Array<string[] | string>;
export type GenericObject = { [k: string]: any };
export type Report = { data: string; code: number };
export type CommandArg = { name: string; description?: string };
export type Example = { cmd: string; description: string };
