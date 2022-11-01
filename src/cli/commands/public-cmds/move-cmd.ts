import chalk from 'chalk';

import { move } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { PathChangeResult } from '../../../consumer/bit-map/bit-map';
import { Group } from '../../command-groups';
import { LegacyCommand } from '../../legacy-command';

export default class Move implements LegacyCommand {
  name = 'move <current-component-dir> <new-component-dir>';
  description = 'move a component to a different filesystem path';
  helpUrl = 'docs/workspace/moving-components';
  arguments = [
    {
      name: 'current-component-dir',
      description: 'the current relative path (in the workspace) to the component directory',
    },
    {
      name: 'new-component-dir',
      description: 'the new relative path (in the workspace) to the component directory',
    },
  ];
  group: Group = 'development';
  extendedDescription = `move files or directories of component(s)\n  https://${BASE_DOCS_DOMAIN}/workspace/moving-components`;
  alias = 'mv';
  loader = true;

  action([from, to]: [string, string]): Promise<any> {
    return move({ from, to });
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
