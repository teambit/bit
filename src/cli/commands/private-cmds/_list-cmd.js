/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand } from '../../../utils';
import { pack } from '../../cli-utils';
import { scopeList } from '../../../api/scope';

export default class List extends Command {
  name = '_list <path> <args>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];
  
  action([path, args]: [string, string]): Promise<any> {
    const { headers } = unpackCommand(args);
    // validateVersion(headers)
    return scopeList(fromBase64(path))
    .then(components => components.map(c => c.toString()));
  }

  report(str: string): string {
    return pack(str);
  }
}
