import chalk from 'chalk';
import Command from '../../command';
import { injectConf } from '../../../api/consumer';
import { InjectConfResult } from '../../../consumer/component-ops/inject-conf';

export default class InjectConf extends Command {
  name = 'inject-conf [id]';
  description = 'injecting components configuration';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['f', 'force', 'force injecting even if there are config files changes']];
  loader = true;
  migration = true;

  async action([id]: [string], { force }: { force?: boolean }): Promise<InjectConfResult> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const res = await injectConf(id, force);
    return res;
  }

  report(injectResults: InjectConfResult): string {
    return `successfully injected ${chalk.bold(injectResults.id)} configuration`;
  }
}
