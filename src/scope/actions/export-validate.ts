import { Scope } from '..';
import { mergeObjects } from '../component-ops/export-scope-components';
import { Action } from './action';

type Options = { clientId: string };

/**
 * do not save anything. just make sure the objects can be merged and there are no conflicts.
 * once done, clear the objects from the memory so then they won't be used by mistake later on.
 */
export class ExportValidate implements Action<Options, void> {
  async execute(scope: Scope, options: Record<string, any>) {
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);
    await mergeObjects(scope, objectList); // if fails, it throws merge-conflict
    scope.objects.clearCache();
  }
}
