export type CommandOption = [string, string, string];
export type CommandOptions = Array<CommandOption>;

export default class Cmd {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  name: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  description: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  alias: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts: CommandOptions;
  commands: Cmd[] = [];
  private?: boolean;
  loader?: boolean;
  skipWorkspace?: boolean;
  remoteOp?: boolean; // Used for adding the token option globally

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  action(params: any, opts: { [key: string]: any }, packageManagerArgs: string[]): Promise<any> {
    console.log('"action" method not implemented on this command'); // eslint-disable-line no-console
    return new Promise(resolve => resolve({}));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  report(data: any, params: any, opts: { [key: string]: any }): string {
    return '"report" method not implemented on this command';
  }

  handleError(): string | null | undefined {
    return null;
  }

  splitList(val: string) {
    return val.split(',');
  }
}
