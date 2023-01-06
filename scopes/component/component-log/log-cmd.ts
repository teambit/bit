import c from 'chalk';
import Table from 'cli-table';
import { Command, CommandOptions } from '@teambit/cli';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentLogMain } from './component-log.main.runtime';

export default class LogCmd implements Command {
  name = 'log <id>';
  description = 'show components(s) version history';
  helpUrl = 'docs/components/navigating-history';
  extendedDescription: string;
  group = 'info';
  alias = '';
  options = [
    ['r', 'remote', 'show log of a remote component'],
    ['', 'parents', 'EXPERIMENTAL. show parents and lanes data'],
    ['o', 'one-line', 'show each log entry in one line'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  migration = true;
  remoteOp = true; // should support log against remote
  skipWorkspace = true;
  arguments = [{ name: 'id', description: 'component-id or component-name' }];

  constructor(private componentLog: ComponentLogMain, docsDomain: string) {
    this.extendedDescription = `https://${docsDomain}/reference/cli-reference#log`;
  }

  async report(
    [id]: [string],
    { remote = false, parents = false, oneLine = false }: { remote: boolean; parents: boolean; oneLine?: boolean }
  ) {
    if (parents) {
      const logs = await this.componentLog.getLogsWithParents(id);
      return logs.join('\n');
    }
    const logs = await this.componentLog.getLogs(id, remote);
    if (oneLine) {
      return logOneLine(logs.reverse());
    }
    // reverse to show from the latest to earliest
    return logs.reverse().map(paintLog).join('\n');
  }

  async json([id]: [string], { remote = false, parents = false }: { remote: boolean; parents: boolean }) {
    if (parents) {
      return this.componentLog.getLogsWithParents(id);
    }
    return this.componentLog.getLogs(id, remote);
  }
}

function paintAuthor(email: string | null | undefined, username: string | null | undefined) {
  if (email && username) {
    return c.white(`author: ${username} <${email}>\n`);
  }
  if (email && !username) {
    return c.white(`author: <${email}>\n`);
  }
  if (!email && username) {
    return c.white(`author: ${username}\n`);
  }

  return '';
}

function paintLog(log: LegacyComponentLog): string {
  const { message, date, tag, hash, username, email } = log;
  const title = tag ? `tag ${tag} (${hash})\n` : `snap ${hash}\n`;
  return (
    c.yellow(title) +
    paintAuthor(email, username) +
    (date ? c.white(`date: ${date}\n`) : '') +
    (message ? c.white(`\n      ${message}\n`) : '')
  );
}

function logOneLine(logs: LegacyComponentLog[]) {
  // table with no style and no borders, just to align the columns.
  const table = new Table({
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
      middle: ' ',
    },
    style: { 'padding-left': 0, 'padding-right': 0 },
  });

  logs.map(({ hash, tag, username, date, message }) =>
    table.push([hash, tag || '', username || '', date || '', message || ''])
  );

  return table.toString();
}
