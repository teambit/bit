/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { scopeList } from '../../../api/scope';

export default class List extends Command {
  name = '_list <path> <args>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [['a', 'all', 'show all components including soft-delete']];

  action([path, all]: [string, string]): Promise<any> {
    return scopeList(fromBase64(path), all).then(components => components.map(c => c.toString()));
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
