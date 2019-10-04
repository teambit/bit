export default class Cmd {
  name: string;
  description: string;
  alias: string;
  opts: [string, string, string][];
  commands: Cmd[] = [];
  private: boolean | null | undefined;
  loader: boolean | null | undefined;

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
