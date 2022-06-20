import chalk from 'chalk';

import { move } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { PathChangeResult } from '../../../consumer/bit-map/bit-map';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Move implements LegacyCommand {
  name = 'move <existing-dir> <new-dir>';
  description = 'move a component to a different filesystem path';
  group: Group = 'development';
  extendedDescription = `move files or directories of component(s)\n  https://${BASE_DOCS_DOMAIN}/workspace/moving-components`;
  alias = 'mv';
  opts = [
    [
      'c',
      'component',
      'LEGACY ONLY. move component files that are spread over multiple directories to one directory. synopsis: `move <component-id> <directory>`',
    ],
  ] as CommandOptions;
  loader = true;

  action([from, to]: [string, string], { component = false }: { component: boolean }): Promise<any> {
    return move({ from, to, component });
  }

  report(componentsChanged: PathChangeResult[]): string {
    const output = componentsChanged.map((component) => {
      const title = chalk.green(`moved component ${component.id.toString()}:\n`);
      const files = component.changes
        .map((file) => `from ${chalk.bold(file.from)} to ${chalk.bold(file.to)}`)
        .join('\n');
      return title + files;
    });
    return output.join('\n');
  }
}
