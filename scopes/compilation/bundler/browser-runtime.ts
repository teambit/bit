import type { ExecutionContext } from '@teambit/envs';

export type BrowserRuntime = {
  entry: (context: ExecutionContext) => Promise<string[]>;
};
