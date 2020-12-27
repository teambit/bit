import { Scope } from '..';
import logger from '../../logger/logger';
import { Lane } from '../models';
import { Action } from './action';

type Options = { ids: string[] };

/**
 * triggered once "bit sign" has completed.
 * it clears the scope cache so then the main bit-start process of the scope will fetch the updated
 * components with all artifacts.
 */
export class PostSign implements Action<Options> {
  async execute(scope: Scope, options: Options): Promise<void> {
    scope.objects.clearCache();
    if (PostSign.onPutHook) {
      PostSign.onPutHook(options.ids, []).catch((err) => {
        logger.error('fatal: onPutHook encountered an error (this error does not stop the process)', err);
        // let the process continue. we don't want to stop it when onPutHook failed.
      });
    }
  }

  static onPutHook: (ids: string[], lanes: Lane[]) => Promise<void>;
}
