export type CommandOption = [string, string, string];
export type CommandOptions = Array<CommandOption>;

export interface LegacyCommand {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  name: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  description: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
