import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { searchAdapter } from '../../../search';
import { Doc } from '../../../search/indexer';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

let compressResponse;
export default class Search implements LegacyCommand {
  name = '_search <path> <args>';
  private = true;
  internal = true;
  description = 'search for components on a remote scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return searchAdapter.scopeSearch(scopePath, payload.query, payload.reindex === 'true');
    });
  }

  report(searchResults: Array<Doc>): string {
    return packCommand(buildCommandMessage(searchResults, undefined, compressResponse), true, compressResponse);
  }
}
