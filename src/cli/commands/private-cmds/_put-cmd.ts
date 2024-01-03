import { put } from '../../../api/scope';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { ObjectList } from '../../../scope/objects/object-list';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

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
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    return new Promise((resolve, reject) => {
      process.stdin
        .on('data', (chunk) => {
          data += chunk.toString();
        })
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .on('end', () => {
          const objectList = ObjectList.fromJsonString(data);
          return put({ objectList, path: fromBase64(path) }, payload, headers)
            .then(resolve)
            .catch(reject);
        });
    });
  }

  report(ids: string[]): string {
    return packCommand(buildCommandMessage({ ids }, undefined, compressResponse), true, compressResponse);
  }
}
