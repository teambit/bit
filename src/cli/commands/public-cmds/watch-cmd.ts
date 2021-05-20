import watchAll from '../../../api/consumer/lib/watch';
import { Group } from '../../command-groups';
import { LegacyCommand } from '../../legacy-command';

export default class Watch implements LegacyCommand {
  name = 'watch';
  description = 'watch components and perform `build` on changes';
  group: Group = 'development';
  alias = 'w';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['v', 'verbose', 'showing npm verbose output for inspection']];
  loader = true;
  migration = true;
  remoteOp = true; // In case the compiler is not installed yet

  action(
    args: string[],
    {
      verbose,
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
