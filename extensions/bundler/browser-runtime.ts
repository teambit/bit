import { ExecutionContext } from '@teambit/environments';

export type BrowserRuntime = {
  entry: (context: ExecutionContext) => Promise<string[]>;
};
