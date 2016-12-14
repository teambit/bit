/** @flow */

export default class Cmd {
  name: string;
  description: string;
  alias: string;
  opts: [string, string, string][];

  action(params: Array<any>, opts: {}): Promise<{[string]: any}> { // eslint-disable-line
    console.log('"action" method not implemented on this command');
    return new Promise(resolve => resolve({}));
  }

  report(data: any): string { // eslint-disable-line
    return '"report" method not implemented on this command';
  }

  handleError(): ?string {
    return null;
  }
}
