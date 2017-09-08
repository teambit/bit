/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { scopeShow } from '../../../api/scope';

export default class _Show extends Command {
  name = '_show <path> <args>';
  private = true;
  description = 'show a specific component on scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    // validateVersion(headers)
    return scopeShow(fromBase64(path), payload);
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
