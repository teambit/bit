// @flow
export type Command = {
  name: string,
  description?: ?string,
  arguments?: ?Array<{name: string, description: string}>,
  action: (args: Object, options: Object) => Promise<any>,
  report: (any) => string,
  handleError?: ?(e: Error) => string,
  loader?: boolean
};
