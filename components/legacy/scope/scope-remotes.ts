import type { ObjectItemsStream } from '@teambit/objects';
import type { FETCH_OPTIONS } from './objects-fetcher/fetch-options';
import type Scope from './scope';

/**
 * the parts of `Remote` / `Remotes` (from @teambit/scope.remotes) that this package uses. they're restated
 * here because the remotes package depends on this one, and importing it back would create a cycle.
 */
export type ScopeRemote = {
  name: string;
  host: string;
  fetch(ids: string[], fetchOptions: FETCH_OPTIONS, context?: Record<string, any>): Promise<ObjectItemsStream>;
  hasObjects(hashes: string[]): Promise<string[]>;
};

export type ScopeRemotes = {
  resolve(scopeName: string): Promise<ScopeRemote>;
  fetch(
    idsGroupedByScope: { [scopeName: string]: string[] },
    options?: Partial<FETCH_OPTIONS>,
    context?: Record<string, any>
  ): Promise<{ [remoteName: string]: ObjectItemsStream }>;
};

export type ScopeRemotesGetter = (scope: Scope) => Promise<ScopeRemotes>;

let scopeRemotesGetter: ScopeRemotesGetter | undefined;

/**
 * registered by the scope aspect on load (it passes `getScopeRemotes` of @teambit/scope.remotes).
 */
export function setScopeRemotesGetter(getter: ScopeRemotesGetter) {
  scopeRemotesGetter = getter;
}

export async function getScopeRemotes(scope: Scope): Promise<ScopeRemotes> {
  if (!scopeRemotesGetter) {
    throw new Error('getScopeRemotes: no remotes getter was registered. make sure the scope aspect is loaded');
  }
  return scopeRemotesGetter(scope);
}
