// @flow
export type Command = {
  name: string;
  description?: string | null | undefined;
  options?: Array<{ alias: string; name: string; description: string }> | null | undefined;
  action: (args: Record<string, any>, options: Record<string, any>) => Promise<any>;
  report: (...args: any[]) => string;
  handleError?: (e: Error) => string;
  loader?: boolean;
};
