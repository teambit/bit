import chalk from 'chalk';
import Command from '../../command';
import { migrate } from '../../../api/consumer';

export default class Migrate extends Command {
  name = 'migrate [scopePath]';
  description = 'migrate scope to the current version';
  private = true;
  loader = true;
  migration = false;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['v', 'verbose', 'showing logs for the migration process']];

  action([scopePath]: [string], { verbose }: { verbose: boolean | null | undefined }): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return migrate(scopePath, verbose).then(result => ({ result, verbose }));
  }

  report(): string {
    return chalk.green('migrate finished');
  }
}
