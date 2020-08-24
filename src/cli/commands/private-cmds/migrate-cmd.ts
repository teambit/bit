import chalk from 'chalk';

import { migrate } from '../../../api/consumer';
import { migrateToHarmony } from '../../../api/consumer/lib/migrate';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Migrate implements LegacyCommand {
  name = 'migrate [scopePath]';
  description = 'migrate scope to the current version';
  private = true;
  loader = true;
  migration = false;
  alias = '';
  opts = [
    ['v', 'verbose', 'showing logs for the migration process'],
    ['h', 'harmony', 'migrate workspace from legacy to Harmony'],
  ] as CommandOptions;

  action(
    [scopePath]: [string],
    { verbose, harmony }: { verbose: boolean | undefined; harmony: boolean }
  ): Promise<any> {
    if (harmony) {
      return migrateToHarmony();
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return migrate(scopePath, verbose).then((result) => ({ result, verbose }));
  }

  report(): string {
    return chalk.green('migrate finished');
  }
}
