/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { extensionsList } from '../../../api/consumer';

export default class Extension extends Command {
  name = 'extension';
  description = 'manage extensions';
  alias = '';
  opts = [['ls', 'list', 'list all extensions']];
  loader = true;

  // $FlowFixMe
  action([], { list }: { list: boolean }): Promise<any> {
    // eslint-disable-line
    if (list) {
      return extensionsList();
    }
    throw new Error('not implemented yet');
  }

  report(results: Object): string {
    return results.map(result => `${chalk.bold(result.name)}: disabled: ${result.disable}`).join('\n');
  }
}
