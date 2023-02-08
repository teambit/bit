import chalk from 'chalk';
import { Command } from '@teambit/cli';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { PathChangeResult } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import { MoverMain } from './mover.main.runtime';

export class MoveCmd implements Command {
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
  group = 'development';
  extendedDescription = `move files or directories of component(s)\n  https://${BASE_DOCS_DOMAIN}/workspace/moving-components`;
  alias = 'mv';
  loader = true;
  options = [];

  constructor(private mover: MoverMain) {}

  async report([from, to]: [string, string]) {
    const componentsChanged: PathChangeResult[] = await this.mover.movePaths({ from, to });
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
