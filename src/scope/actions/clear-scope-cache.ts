import { Scope } from '..';
import { Action } from './action';

/**
 * load objects from pending-dir by a client-id and persist them to the object directory.
 * once done, remove the pending-dir to free the resource.
 */
export class ClearScopeCache implements Action {
  async execute(scope: Scope): Promise<void> {
    scope.objects.clearCache();
  }
}
