import { isEmpty } from 'lodash';
import { describeScope } from '../../../api/scope';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { LegacyCommand } from '../../legacy-command';

let compressResponse;
export default class Prepare implements LegacyCommand {
  name = '_scope <path> <args>';
  description = 'describe a scope';
  private = true;
  internal = true;
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    return describeScope(fromBase64(path));
  }

  report(scopeObj: any): string {
    if (isEmpty(scopeObj)) return '';
    return packCommand(buildCommandMessage(scopeObj, undefined, compressResponse), true, compressResponse);
  }
}
