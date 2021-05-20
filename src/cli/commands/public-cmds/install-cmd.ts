import { installAction } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { LinksResult } from '../../../links/node-modules-linker';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import linkTemplate from '../../templates/link-template';

export default class Install implements LegacyCommand {
  name = 'install [ids...]';
  shortDescription = 'Install node packages of all components and calls the link command';
  group: Group = 'collaborate';
  description = `Installs all dependencies for all the imported components (or for a specific one), whether they were defined in your package.json or in each of the imported components, and links them. \n  https://${BASE_DOCS_DOMAIN}/docs/installing-components`;
  alias = 'i';
  opts = [['v', 'verbose', 'show a more verbose output when possible']] as CommandOptions;
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
