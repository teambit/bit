import { Scope } from '..';
import { BitIds } from '../../bit-id';
import logger from '../../logger/logger';
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
    const bitIds: BitIds = BitIds.deserialize(options.ids);
    options.fetchFromOriginalScopes
      ? await scopeComponentsImporter.importManyFromOriginalScopes(bitIds)
      : await scopeComponentsImporter.importMany({ ids: bitIds, cache: true });

    logger.debugAndAddBreadCrumb('FetchMissingDeps', 'successfully ran importMany');
  }
}
