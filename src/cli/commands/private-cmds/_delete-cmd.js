/** @flow */
import Command from '../../command';
import { remove } from '../../../api/scope';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';

export default class Delete extends Command {
  name = '_delete <path> <args>';
  private = true;
  description = 'remove a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    return remove({ path: fromBase64(path), bitIds: payload.bitIds, force: payload.force });
  }

  report(str): string {
    return packCommand(buildCommandMessage(str));
  }
}
