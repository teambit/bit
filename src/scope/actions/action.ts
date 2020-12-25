import type { Scope } from '..';

export interface Action<Options = undefined, Result = void> {
  execute(scope: Scope, options?: Options): Promise<Result>;
}
