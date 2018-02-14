/** @flow */
import Command from '../../command';
import { installAction } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';
import type { LinksResult } from '../../../links/node-modules-linker';

export default class Install extends Command {
  name = 'install';
  description = 'install packages of all components and link them';
  alias = '';
  opts = [['v', 'verbose', 'show a more verbose output when possible']];
  loader = true;

  action(args: string[], { verbose }: { verbose?: boolean }): Promise<LinksResult[]> {
    return installAction(verbose);
  }

  report(results: LinksResult[]): string {
    return linkTemplate(results);
  }
}
