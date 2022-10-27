import { Scope } from '..';
import { BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import ScopeComponentsImporter from '../component-ops/scope-components-importer';
import { Action } from './action';

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
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    const bitIds: BitIds = BitIds.deserialize(options.ids);
    await scopeComponentsImporter.importMissingHistory(bitIds);
    logger.debugAndAddBreadCrumb('FetchMissingHistory', 'completed successfully');
  }
}
