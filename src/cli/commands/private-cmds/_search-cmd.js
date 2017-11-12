/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, buildCommandMessage, packCommand } from '../../../utils';
import { searchAdapter } from '../../../search';
import { Doc } from '../../../search/indexer';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class Search extends Command {
  name = '_search <path> <args>';
  private = true;
  description = 'search for components on a remote scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return searchAdapter.scopeSearch(scopePath, payload.query, payload.reindex === 'true');
    });
  }

  report(searchResults: Array<Doc>): string {
    return packCommand(buildCommandMessage(searchResults));
  }
}
