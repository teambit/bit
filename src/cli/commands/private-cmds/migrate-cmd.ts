import chalk from 'chalk';
import { LegacyCommand, CommandOptions } from '../../command';
import { migrate } from '../../../api/consumer';

export default class Migrate extends LegacyCommand {
  name = 'migrate [scopePath]';
  description = 'migrate scope to the current version';
  private = true;
  loader = true;
  migration = false;
  alias = '';
  opts = [['v', 'verbose', 'showing logs for the migration process']] as CommandOptions;

  action([scopePath]: [string], { verbose }: { verbose: boolean | null | undefined }): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return migrate(scopePath, verbose).then(result => ({ result, verbose }));
  }

  report(): string {
    return chalk.green('migrate finished');
  }
}
