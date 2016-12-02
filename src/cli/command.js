/** @flow */

export default class Command {
  name: string;
  description: string;
  alias: string;
  opts: [string, string, string][];

  action(params: Array<any>, opts: {}): Promise<{[string]: any}> {
    const m = this.alias;
    console.log('"action" method not implemented on this command');
    return new Promise(resolve => resolve(m));
  }

  report(data: {string: any}): string {
    return '"report" method not implemented on this command';
  }

  handleError(): ?string {
    return null;
  }
}
