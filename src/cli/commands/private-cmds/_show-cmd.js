/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { pack } from '../../cli-utils';
import { scopeShow } from '../../../api/scope';

export default class _Show extends Command {
  name = '_show <path> <id>';
  private = true;
  description = 'show a specific component on scope';
  alias = '';
  opts = [];
  
  action([path, id]: [string, string]): Promise<any> {
    return scopeShow(fromBase64(path), fromBase64(id));
  }

  report(str: string): string {
    return pack(str);
  }
}
