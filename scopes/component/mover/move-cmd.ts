import chalk from 'chalk';
import { Command } from '@teambit/cli';
import { PathChangeResult } from '@teambit/legacy.bit-map';
import { MoverMain } from './mover.main.runtime';

export class MoveCmd implements Command {
  name = 'move <current-component-dir> <new-component-dir>';
  description = 'move a component to a different filesystem path';
  extendedDescription = `(note: this does NOT affect the component's name or scope, just its location in the workspace)`;
  helpUrl = 'reference/workspace/moving-components';
  arguments = [
    {
      name: 'current-component-dir',
      description: "the component's current directory (relative to the workspace root)",
    },
    {
      name: 'new-component-dir',
      description: "the new directory (relative to the workspace root) to create and move the component's files to",
    },
  ];
  group = 'component-config';
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
