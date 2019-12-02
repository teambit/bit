import Command from '../../command';
import { describeScope } from '../../../api/scope';
import { fromBase64, empty, buildCommandMessage, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';

let compressResponse;
export default class Prepare extends Command {
  name = '_scope <path> <args>';
  description = 'describe a scope';
  private = true;
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    return describeScope(fromBase64(path));
  }

  report(scopeObj: any): string {
    if (empty(scopeObj)) return '';
    return packCommand(buildCommandMessage(scopeObj, undefined, compressResponse), true, compressResponse);
  }
}
