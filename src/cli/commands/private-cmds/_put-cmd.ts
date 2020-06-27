import { LegacyCommand } from '../../legacy-command';
import { fromBase64, buildCommandMessage, packCommand, unpackCommand } from '../../../utils';
import { put } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';

let compressResponse;
export default class Put implements LegacyCommand {
  name = '_put <path> <args>';
  private = true;
  internal = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    let data = '';
    const { headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    return new Promise((resolve, reject) => {
      process.stdin
        .on('data', chunk => {
          data += chunk.toString();
        })
        .on('end', () => {
          logger.info('Checking if a migration is needed');
          const scopePath = fromBase64(path);
          return migrate(scopePath, false)
            .then(() => {
              return put({ componentObjects: data, path: fromBase64(path) }, headers);
            })
            .then(resolve)
            .catch(reject);
        });
    });
  }

  report(ids: string[]): string {
    return packCommand(buildCommandMessage({ ids }, undefined, compressResponse), true, compressResponse);
  }
}
