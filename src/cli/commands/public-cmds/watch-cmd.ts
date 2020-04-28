import Command, { CommandOptions } from '../../command';
import { watchAll } from '../../../api/consumer';

export default class Watch extends Command {
  name = 'watch';
  description = 'watch components and perform `build` on changes';
  alias = 'w';
  opts = [['v', 'verbose', 'showing npm verbose output for inspection']] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true; // In case the compiler is not installed yet

  action(
    args: string[],
    {
      verbose
    }: {
      verbose: boolean | null | undefined;
    }
  ): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return watchAll(verbose);
  }

  report(): string {
    return 'watcher terminated';
  }
}
