import type { Scope } from '@teambit/legacy.scope';

export type AuthData = { type: string; credentials: string };

export interface Action<Options = undefined, Result = void> {
  execute(scope: Scope, options?: Options, authData?: AuthData): Promise<Result>;
}
