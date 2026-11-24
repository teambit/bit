import type { ObjectItemsStream } from '@teambit/objects';
import type { FETCH_OPTIONS } from './objects-fetcher/fetch-options';

/**
 * the parts of `Remote` / `Remotes` (from @teambit/scope.remotes) that this package uses. they're restated
 * here because the remotes package depends on this one, and importing it back would create a cycle.
 */
export type Remote = {
  name: string;
  host: string;
  fetch(ids: string[], fetchOptions: FETCH_OPTIONS, context?: Record<string, any>): Promise<ObjectItemsStream>;
  hasObjects(hashes: string[]): Promise<string[]>;
};

export type Remotes = {
  resolve(scopeName: string): Promise<Remote>;
  fetch(
    idsGroupedByScope: { [scopeName: string]: string[] },
    options?: Partial<FETCH_OPTIONS>,
    context?: Record<string, any>
  ): Promise<{ [remoteName: string]: ObjectItemsStream }>;
};
