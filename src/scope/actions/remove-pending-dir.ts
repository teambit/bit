import { Scope } from '..';
import { Action } from './action';

type Options = { clientId: string };

/**
 * used mainly to free the resources when the export process failed.
 */
export class RemovePendingDir implements Action<Options> {
  async execute(scope: Scope, options: Options) {
    await scope.removePendingDir(options.clientId);
  }
}
