/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { migrate } from '../../../api/consumer';

export default class Migrate extends Command {
  name = 'migrate [scopePath]';
  description = 'migrate scope to the current version';
  private = true;
  alias = '';
  opts = [['v', 'verbose', 'showing logs for the migration process']];

  action([scopePath]: [string], { verbose }: { verbose: ?boolean }): Promise<any> {
    return migrate(scopePath || process.cwd(), verbose).then(result => ({ result, verbose }));
  }

  report({ result, verbose }: { result: boolean, verbose: ?boolean }): string {
    return chalk.green('migrate finished');
  }
}
