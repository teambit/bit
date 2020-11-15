import { action } from '../../../api/scope/lib/action';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

let compressResponse;

export default class Action implements LegacyCommand {
  name = '_action <path> <args>';
  private = true;
  internal = true;
  description = 'execute a generic action';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    const scopePath = fromBase64(path);
    return action(scopePath, payload.name, payload.options);
  }

  report(results: any): string {
    return packCommand(buildCommandMessage(results, undefined, compressResponse), true, compressResponse);
  }
}
