import { migrate } from '../../../api/consumer';
import { deprecate } from '../../../api/scope';
import logger from '../../../logger/logger';
import { DeprecationResult } from '../../../scope/component-ops/components-deprecation';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

let compressResponse;
export default class Deprecate implements LegacyCommand {
  name = '_deprecate <path> <args>';
  private = true;
  internal = true;
  description = 'deprecate a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return deprecate({ path: scopePath, ids: payload.ids }, headers);
    });
  }

  report(deprecationResult: DeprecationResult): string {
    return packCommand(buildCommandMessage(deprecationResult, undefined, compressResponse), true, compressResponse);
  }
}
