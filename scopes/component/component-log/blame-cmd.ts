import { Command, CommandOptions } from '@teambit/cli';
import { ComponentLogMain } from './component-log.main.runtime';
import { getEmptyTableWithoutStyle } from './log-cmd';

export class BlameCmd implements Command {
  name = 'blame <filepath>';
  description = 'EXPERIMENTAL. per line, show who and when was the last to modify it';
  group = 'info';
  alias = '';
  options = [['m', 'include-message', 'show the commit message']] as CommandOptions;
  arguments = [{ name: 'filepath', description: 'file path relative to the workspace' }];

  constructor(private componentLog: ComponentLogMain) {}

  async report([filePath]: [string], { includeMessage = false }: { includeMessage?: boolean }) {
    const results = await this.componentLog.blame(filePath);
    const table = getEmptyTableWithoutStyle();
    results.forEach(({ hash, tag, username, date, message, lineNumber, lineContent }) => {
      const shortHash = hash.substring(0, 9);
      const shortMessage = includeMessage ? message.split('\n')[0] : '';
      table.push([shortHash, tag || '', username, date, shortMessage, `${lineNumber})`, lineContent]);
    });
    return table.toString();
  }
}
