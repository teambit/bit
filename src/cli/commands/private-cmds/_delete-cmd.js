/** @flow */
import Command from '../../command';
import { remove } from '../../../api/scope';
import { packCommand, buildCommandMessage } from '../../../utils';

export default class Delete extends Command {
  name = '_delete <path> <args...>';
  private = true;
  description = 'remove a component from a scope';
  alias = '';
  opts = [];

  action([path, ids, hard, force]: [string, string[], boolean, boolean]): Promise<any> {
    return remove({ path, bitIds: ids, hard, force });
  }

  report(bitIds: string[]): string {
    return packCommand(buildCommandMessage(bitIds));
  }
}
