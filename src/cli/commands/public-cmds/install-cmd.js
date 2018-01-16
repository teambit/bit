/** @flow */
import Command from '../../command';
import { installAction } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';

export default class Install extends Command {
  name = 'install';
  description = 'install packages of all components and link them';
  alias = '';
  opts = [['v', 'verbose', 'show a more verbose output when possible']];
  loader = true;

  action(args: string[], { verbose }: { verbose?: boolean }): Promise<any> {
    return installAction(verbose);
  }

  report(results): string {
    return linkTemplate(results);
  }
}
