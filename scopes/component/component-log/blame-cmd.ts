import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { ComponentLogMain } from './component-log.main.runtime';
import { getEmptyTableWithoutStyle } from './log-cmd';
import { blameCommand } from './component-log.commands';

export class BlameCmd implements Command {
  name = blameCommand.name;
  description = blameCommand.description;
  extendedDescription = blameCommand.extendedDescription;
  group = blameCommand.group;
  alias = blameCommand.alias;
  options = blameCommand.options;
  arguments = blameCommand.arguments;

  constructor(private componentLog: ComponentLogMain) {}

  async report([filePath]: [string], { includeMessage = false }: { includeMessage?: boolean }) {
    const results = await this.componentLog.blame(filePath);
    if (!results.length) return chalk.yellow('no results found');
    const table = getEmptyTableWithoutStyle();
    results.forEach(({ hash, tag, username, date, message, lineNumber, lineContent }) => {
      const shortHash = hash.substring(0, 9);
      const shortMessage = includeMessage ? message.split('\n')[0] : '';
      table.push([shortHash, tag || '', username, date, shortMessage, `${lineNumber})`, lineContent]);
    });
    return table.toString();
  }
}
