import type { Scope } from '@teambit/legacy.scope';
import type { AuthData } from '@teambit/scope.network';

export interface Action<Options = undefined, Result = void> {
  execute(scope: Scope, options?: Options, authData?: AuthData): Promise<Result>;
}
