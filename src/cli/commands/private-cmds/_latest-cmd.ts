import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { latestVersions } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';

let compressResponse;
export default class Latest extends Command {
  name = '_latest <path> <args>';
  private = true;
  description = 'latest version numbers of given components';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return latestVersions(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str, undefined, compressResponse), true, compressResponse);
  }
}
