/** @flow */

export default class Cmd {
  name: string;
  description: string;
  alias: string;
  opts: [string, string, string][];
  commands: Cmd[] = [];
  private: ?boolean;
  loader: ?boolean;

  // eslint-disable-next-line no-unused-vars
  action(params: any, opts: { [string]: any }): Promise<{ [string]: any }> {
    console.log('"action" method not implemented on this command');
    return new Promise(resolve => resolve({}));
  }

  // eslint-disable-next-line no-unused-vars
  report(data: any): string {
    return '"report" method not implemented on this command';
  }

  handleError(): ?string {
    return null;
  }

  splitList(val) {
    return val.split(',');
  }
}
