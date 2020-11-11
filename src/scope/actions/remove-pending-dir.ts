import { Scope } from '..';
import { Action } from './action';

type Options = { clientId: string };

export class RemovePendingDir implements Action<Options, void> {
  async execute(scope: Scope, options: Options) {
    await scope.removePendingDir(options.clientId);
  }
}
