import chalk from 'chalk';

import { injectConf } from '../../../api/consumer';
import { InjectConfResult } from '../../../consumer/component-ops/inject-conf';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class InjectConf implements LegacyCommand {
  name = 'inject-conf [id]';
  description = 'injecting components configuration';
  alias = '';
  private = true;
  opts = [['f', 'force', 'force injecting even if there are config files changes']] as CommandOptions;
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
