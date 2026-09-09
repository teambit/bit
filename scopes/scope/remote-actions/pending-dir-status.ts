import type { Scope } from '@teambit/legacy.scope';
import type { Action } from './action';

type Options = { clientId: string };

export type PendingDirStatusResult = { exists: boolean };

/**
 * the read-only counterpart of `RemovePendingDir`: tells whether this scope still holds the pending
 * objects of the given export-id, without touching them.
 *
 * it exists as its own action rather than a "dryRun" option on `RemovePendingDir` on purpose. an
 * older server doesn't know about new options, it would ignore "dryRun" and delete the dir - the
 * exact opposite of a probe. an unknown action *name*, on the other hand, is rejected with
 * ActionNotFound, which the client can safely detect and degrade on.
 */
export class PendingDirStatus implements Action<Options, PendingDirStatusResult> {
  async execute(scope: Scope, options: Options): Promise<PendingDirStatusResult> {
    return { exists: await scope.hasPendingDir(options.clientId) };
  }
}
