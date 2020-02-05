import { performance } from 'perf_hooks';
import Command from '../../command';
import { fromBase64, buildCommandMessage, packCommand, unpackCommand } from '../../../utils';
import { put } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';

let compressResponse;
export default class Put extends Command {
  name = '_put <path> <args>';
  private = true;
  description = 'upload a component to a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    let data = '';
    const t0 = performance.now();
    const { headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    return new Promise((resolve, reject) => {
      process.stdin
        .on('data', chunk => {
          data += chunk.toString();
          // const size = chunk.byteLength;
          // logger.debug(`DATA ${size}B. ${Math.floor(size / 1024)}KB ${Math.floor(size / 1024 / 1024)}MB`);
        })
        .on('end', () => {
          const size = data.length;
          logger.debug(`END ${size}B. ${Math.floor(size / 1024)}KB ${Math.floor(size / 1024 / 1024)}MB`);
          const t1 = performance.now();
          logger.debug(`_put, getting all data fro the client took ${t1 - t0} milliseconds.`);
          logger.debug(`_put, transfer rate is ${Math.floor(size / 1024 / 1024 / ((t1 - t0) / 1000))} MB / Sec`);
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
