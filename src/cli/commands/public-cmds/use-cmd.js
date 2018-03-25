/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { use } from '../../../api/consumer';
import { BitId } from '../../../bit-id';

export default class Use extends Command {
  name = 'use <version> <ids...>';
  description = 'switch between versions';
  alias = 'U';
  opts = [];
  loader = true;

  action([version, ids]: [string, string[]]): Promise<*> {
    return use(version, ids);
  }

  report({ components, version }: { components: BitId[], version: string }): string {
    const title = `the following components were switched to version ${chalk.bold(version)}\n`;
    const componentsStr = components.map(c => c.toStringWithoutVersion()).join('\n');
    return chalk.underline(title) + chalk.green(componentsStr);
  }
}
