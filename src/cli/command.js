/** @flow */

export interface Command {
  name: string;
  description: string;
  alias: string;
  opts: any[];
  action(params: Array<any>): Promise<any>;
  report(data: {string: any}): string;
}
