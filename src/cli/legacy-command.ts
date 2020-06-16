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
  remoteOp?: boolean; // Used for adding the token option globally

  action(params: any, opts: { [key: string]: any }, packageManagerArgs?: string[]): Promise<any>;

  report(data: any, params: any, opts: { [key: string]: any }): string;
}
