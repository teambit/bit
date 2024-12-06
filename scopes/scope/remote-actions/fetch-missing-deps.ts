import { ComponentIdList } from '@teambit/component-id';
import { Scope } from '@teambit/legacy/dist/scope';
import logger from '@teambit/legacy/dist/logger/logger';
import { Action } from './action';

type Options = { ids: string[]; fetchFromOriginalScopes: boolean };

/**
 * to avoid left-pad kind of situation, make sure that all external dependencies are cached. if
 * they don't exist, import them.
 */
export class FetchMissingDeps implements Action<Options> {
  async execute(scope: Scope, options: Options): Promise<void> {
    logger.debugAndAddBreadCrumb('FetchMissingDeps', 'trying to importMany in case there are missing dependencies');
    const scopeComponentsImporter = scope.scopeImporter;
    const bitIds: ComponentIdList = ComponentIdList.fromStringArray(options.ids);
    options.fetchFromOriginalScopes
      ? await scopeComponentsImporter.importManyFromOriginalScopes(bitIds)
      : await scopeComponentsImporter.importMany({ ids: bitIds, cache: true, preferDependencyGraph: false });

    logger.debugAndAddBreadCrumb('FetchMissingDeps', 'successfully ran importMany');
  }
}
