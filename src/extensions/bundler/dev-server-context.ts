import { ExecutionContext } from '../environments';

export interface BundlerContext extends ExecutionContext {
  entry: string[];
}
