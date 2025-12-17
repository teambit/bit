import { ComponentIdList } from '@teambit/component-id';
import type { Scope } from '@teambit/legacy.scope';
import { logger } from '@teambit/legacy.logger';
import type { Action } from './action';

type Options = { ids: string[] };

/**
 * Fetches only the VersionHistory objects for components without fetching all Version objects.
 * This is a lightweight alternative to FetchMissingHistory that doesn't block for long.
 *
 * Use this during export to quickly get the version-history graph, then run FetchMissingHistory
 * asynchronously afterwards to get the full history.
 */
export class FetchVersionHistory implements Action<Options> {
  async execute(scope: Scope, options: Options): Promise<void> {
    logger.debugAndAddBreadCrumb('FetchVersionHistory', 'fetching version-history objects from original scopes');
    const scopeComponentsImporter = scope.scopeImporter;
    const bitIds: ComponentIdList = ComponentIdList.fromStringArray(options.ids);
    const externals = bitIds.filter((bitId) => !scope.isLocal(bitId));
    if (!externals.length) {
      logger.debug('FetchVersionHistory, no external components, nothing to fetch');
      return;
    }
    const externalIds = ComponentIdList.fromArray(externals);
    await scopeComponentsImporter.importWithoutDeps(externalIds.toVersionLatest(), {
      cache: false,
      includeVersionHistory: true,
      reason: 'fetching version-history objects for external components',
    });
    logger.debugAndAddBreadCrumb('FetchVersionHistory', 'completed successfully');
  }
}
