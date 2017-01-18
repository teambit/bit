/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { pack } from '../../cli-utils';
import { scopeList } from '../../../api/scope';

export default class List extends Command {
  name = '_list <path>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];
  
  action([path]: [string]): Promise<any> {
    console.log(fromBase64(path));
    return scopeList(fromBase64(path));
  }

  report(str: string): string {
    return pack(str);
  }
}
