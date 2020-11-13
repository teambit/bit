import type { Scope } from '..';

export interface Action<Options, Result> {
  execute(scope: Scope, options: Options): Promise<Result>;
}
