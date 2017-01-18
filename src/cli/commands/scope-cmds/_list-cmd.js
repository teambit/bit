/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { scopeList } from '../../../api/scope';

export default class List extends Command {
  name = '_list <path>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];
  
  action([path]: [string]): Promise<any> {
    return scopeList({
      path: fromBase64(path)
    });
  }

  report(): string {
    return 'ok';
  }
}
