import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { ComponentLogMain } from './component-log.main.runtime';
import { getEmptyTableWithoutStyle, paintAuthor } from './log-cmd';

export class LogFileCmd implements Command {
  name = 'log-file <filepath>';
  description = 'EXPERIMENTAL. display history of changes to a specific file';
  extendedDescription = `shows version history for a specific file within component versions.
tracks file-level changes across component snaps and tags.
displays file modifications, hashes, and associated commit information.`;
  group = 'version-control';
  alias = '';
  options = [['o', 'one-line', 'show each log entry in one line']] as CommandOptions;
  arguments = [{ name: 'filepath', description: 'file path relative to the workspace' }];

  constructor(private componentLog: ComponentLogMain) {}

  async report([filePath]: [string], { oneLine = false }: { oneLine?: boolean }) {
    const results = await this.componentLog.getFileLog(filePath);
    if (oneLine) {
      const table = getEmptyTableWithoutStyle();
      results.forEach(({ hash, tag, username, date, message, fileHash }) => {
        table.push([hash, tag || '', username || '', date, message, fileHash]);
      });
      return table.toString();
    }
    const output = results.map(({ hash, tag, username, email, date, message, fileDiff }) => {
      const title = tag ? `tag ${tag} (${hash})\n` : `snap ${hash}\n`;
      const author = paintAuthor(email, username);
      const body = (fileDiff || chalk.green('<FILE-ADDED>'))
        .split('\n')
        .map((line) => `      ${line}`)
        .join('\n');
      return (
        chalk.yellow(title) +
        author +
        (date ? chalk.white(`date: ${date}\n`) : '') +
        (message ? chalk.white(`message: ${message}\n\n`) : '\n') +
        body
      );
    });
    return output.join('\n');
  }
}
