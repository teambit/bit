/** @flow */
import Command from '../../command';
import { installAction } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';
import type { LinksResult } from '../../../links/node-modules-linker';

export default class Install extends Command {
  name = 'install [ids...]';
  description = 'install packages of components and link them, if no ID is specified, install all';
  alias = '';
  opts = [['v', 'verbose', 'show a more verbose output when possible']];
  loader = true;

  action(
    [ids]: [string[]],
    { verbose = false }: { verbose?: boolean },
    packageManagerArgs: string[]
  ): Promise<LinksResult[]> {
    return installAction(ids, verbose, packageManagerArgs);
  }

  report(results: LinksResult[]): string {
    return linkTemplate(results);
  }
}
