import { migrate } from '../../../api/consumer';
import { scopeList } from '../../../api/scope';
import { ListScopeResult } from '../../../consumer/component/components-list';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

let compressResponse;

export default class List implements LegacyCommand {
  name = '_list <path> <args>';
  private = true;
  internal = true;
  description = 'list scope components';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<ListScopeResult[]> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return scopeList(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str, undefined, compressResponse), true, compressResponse);
  }
}
