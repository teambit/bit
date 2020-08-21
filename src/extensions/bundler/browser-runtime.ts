import { ExecutionContext } from '../environments';

export type BrowserRuntime = {
  entry: (context: ExecutionContext) => Promise<string[]>;
};
