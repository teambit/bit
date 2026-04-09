import chalk from 'chalk';
import type { Command } from '@teambit/cli';
import { formatTitle, formatItem, joinSections } from '@teambit/cli';
import type { PathChangeResult } from '@teambit/legacy.bit-map';
import type { MoverMain } from './mover.main.runtime';

export class MoveCmd implements Command {
  name = 'move <current-component-dir> <new-component-dir>';
  description = 'relocate a component to a different directory';
  extendedDescription = `moves component files to a new location within the workspace and updates the .bitmap tracking.
only changes the filesystem location - does not affect the component's name, scope, or ID.
useful for reorganizing workspace structure or following new directory conventions.`;
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
  group = 'component-development';
  alias = 'mv';
  loader = true;
  options = [];

  constructor(private mover: MoverMain) {}

  async report([from, to]: [string, string]) {
    const componentsChanged: PathChangeResult[] = await this.mover.movePaths({ from, to });
    const sections = componentsChanged.map((component) => {
      const title = formatTitle(`moved component ${component.id.toString()}`);
      const files = component.changes.map((file) =>
        formatItem(`from ${chalk.bold(file.from)} to ${chalk.bold(file.to)}`)
      );
      return `${title}\n${files.join('\n')}`;
    });
    return joinSections(sections);
  }
}
