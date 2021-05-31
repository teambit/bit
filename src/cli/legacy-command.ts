import { Group } from './command-groups';

export type CommandOption = [string, string, string];
export type CommandOptions = Array<CommandOption>;

export interface LegacyCommand {
  name: string;
  description: string;
  alias: string;
  opts?: CommandOptions;
  commands?: LegacyCommand[];
  private?: boolean;
  loader?: boolean;
  skipWorkspace?: boolean;
  migration?: boolean;
  internal?: boolean; // used for serialize the error it returns
  remoteOp?: boolean; // Used for adding the token option globally
  group?: Group; // for grouping in the "bit --help" page
  shortDescription?: string; // for the "bit --help" page.

  action(params: any, opts: { [key: string]: any }, packageManagerArgs?: string[]): Promise<any>;

  report(data: any, params: any, opts: { [key: string]: any }): string;
}
