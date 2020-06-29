import { ExecutionContext } from '../environments';

export interface DevServerContext extends ExecutionContext {
  entry: string[];
}
