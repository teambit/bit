import { Scope } from '..';
import { BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import ScopeComponentsImporter from '../component-ops/scope-components-importer';
import { Action } from './action';

type Options = { ids: string[] };

/**
 * to avoid left-pad kind of situation, make sure that all external dependencies are cached. if
 * they don't exist, import them.
 */
export class FetchMissingDeps implements Action<Options, void> {
  async execute(scope: Scope, options: Options): Promise<void> {
    logger.debugAndAddBreadCrumb('FetchMissingDeps', 'trying to importMany in case there are missing dependencies');
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    const bitIds: BitIds = BitIds.deserialize(options.ids);
    await scopeComponentsImporter.importMany(bitIds, true); // resolve dependencies
    logger.debugAndAddBreadCrumb('FetchMissingDeps', 'successfully ran importMany');
  }
}
