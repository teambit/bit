import type { Scope } from '@teambit/legacy.scope';

/**
 * same shape as `AuthData` of @teambit/scope.network. restated here because the network depends on the
 * actions (through scope-api), so importing it back would create a cycle.
 */
export type AuthData = { type: string; credentials: string };

export interface Action<Options = undefined, Result = void> {
  execute(scope: Scope, options?: Options, authData?: AuthData): Promise<Result>;
}
