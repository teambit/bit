/** @flow */
import Command from '../../command';
import { watchAll } from '../../../api/consumer';

export default class Watch extends Command {
  name = 'watch';
  description = 'watch components and perform `build` on changes';
  alias = 'w';
  opts = [['v', 'verbose', 'showing npm verbose output for inspection']];
  loader = true;
  migration = true;

  action(
    args: string[],
    {
      verbose
    }: {
      verbose: ?boolean
    }
  ): Promise<*> {
    return watchAll(verbose);
  }

  report(): string {
    return 'watcher terminated';
  }
}
