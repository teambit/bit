import Command from '../../command';
import { installAction } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';
import { LinksResult } from '../../../links/node-modules-linker';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Install extends Command {
  name = 'install [ids...]';
  description = `Installs all dependencies for all the sourced components (or for a specific one), whether they were defined in your package.json or in each of the sourced components, and links them. \n  https://${BASE_DOCS_DOMAIN}/docs/installing-components`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
