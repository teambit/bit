/** @flow */
import Command from '../../command';
import { remove } from '../../../api/consumer';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [
    ['h', 'hard [boolean]', 'delete component with dependencies(default = false)'],
    ['f', 'force [boolean]', 'delete components with dependencies and remove files(default = false)'],
    ['r', 'remote [boolean]', 'remove from remote scope']
  ];

  action(
    [ids]: [string],
    { hard = false, force = false, remote = false }: { hard: Boolean, force: Boolean, remote: Boolean }
  ): Promise<any> {
    return remove({ ids, hard, force, remote });
  }

  report(bitIds: Array<{ id: string }>): string {
    return bitIds;
  }
}
