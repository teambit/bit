import { ComponentIdList } from '@teambit/component-id';
import type { Scope } from '@teambit/legacy.scope';
import { logger } from '@teambit/legacy.logger';
import type { Action } from './action';

type Options = { ids: string[] };

/**
 * for lanes, when components from other scopes are exported to this scope, some history might be missing.
 */
export class FetchMissingHistory implements Action<Options> {
  async execute(scope: Scope, options: Options): Promise<void> {
    logger.debugAndAddBreadCrumb(
      'FetchMissingHistory',
      'check if history is missing and fetch it from original scopes'
    );
    const scopeComponentsImporter = scope.scopeImporter;
    const bitIds: ComponentIdList = ComponentIdList.fromStringArray(options.ids);
    await scopeComponentsImporter.importMissingHistory(bitIds);
    logger.debugAndAddBreadCrumb('FetchMissingHistory', 'completed successfully');
  }
}
