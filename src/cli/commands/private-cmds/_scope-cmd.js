/** @flow */
import Command from '../../command';
import { describeScope } from '../../../api/scope';
import { fromBase64, empty, buildCommandMessage, packCommand } from '../../../utils';

export default class Prepare extends Command {
  name = '_scope <path> <args>';
  description = 'describe a scope';
  private = true;
  alias = '';
  opts = [];

  action([path, ]: [string, string]): Promise<*> {
    return describeScope(fromBase64(path));
  }

  report(scopeObj: any): string {
    if (empty(scopeObj)) return '';
    return packCommand(buildCommandMessage(scopeObj));
  }
}
