import { LegacyCommand } from '../../legacy-command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { graph } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';

let compressResponse;
// eslint-disable-next-line @typescript-eslint/class-name-casing
export default class _Graph implements LegacyCommand {
  name = '_graph <path> <args>';
  private = true;
  description = 'returns scope graph or sub-graph when component id is given';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return graph(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str, undefined, compressResponse), true, compressResponse);
  }
}
