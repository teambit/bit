import chalk from 'chalk';
import type { Command } from '@teambit/cli';
import { formatTitle, formatItem, joinSections } from '@teambit/cli';
import type { PathChangeResult } from '@teambit/legacy.bit-map';
import type { MoverMain } from './mover.main.runtime';
import { moveCommand } from './mover.commands';

export class MoveCmd implements Command {
  name = moveCommand.name;
  description = moveCommand.description;
  extendedDescription = moveCommand.extendedDescription;
  helpUrl = moveCommand.helpUrl;
  arguments = moveCommand.arguments;
  group = moveCommand.group;
  alias = moveCommand.alias;
  loader = moveCommand.loader;
  options = moveCommand.options;

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
