import type { Scope } from '@teambit/legacy.scope';
import type { Action } from './action';

type Options = { clientId: string };

export type RemovePendingDirResult = { existed: boolean };

/**
 * used mainly to free the resources when the export process failed.
 *
 * the returned "existed" is additive - an older server returns nothing here (the route sends `{}`),
 * so a client must treat a missing "existed" as "unknown" rather than as "false".
 */
export class RemovePendingDir implements Action<Options, RemovePendingDirResult> {
  async execute(scope: Scope, options: Options): Promise<RemovePendingDirResult> {
    return scope.removePendingDir(options.clientId);
  }
}
