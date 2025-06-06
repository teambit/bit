import c from 'chalk';
import Table from 'cli-table';
import { Command, CommandOptions } from '@teambit/cli';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentLogMain, LogOpts } from './component-log.main.runtime';

type LogFlags = {
  remote?: boolean;
  parents?: boolean;
  oneLine?: boolean;
  fullHash?: boolean;
  fullMessage?: boolean;
  showHidden?: boolean;
};
export default class LogCmd implements Command {
  name = 'log <id>';
  description = 'show components(s) version history';
  helpUrl = 'reference/components/navigating-history';
  extendedDescription: string;
  group = 'version-control';
  alias = '';
  options = [
    ['r', 'remote', 'show log of a remote component'],
    ['', 'parents', 'show parents and lanes data'],
    ['o', 'one-line', 'show each log entry in one line'],
    ['f', 'full-hash', 'show full hash of the snap (default to the first 9 characters for --one-line/--parents flags)'],
    ['m', 'full-message', 'show full message of the snap (default to the first line for --one-line/--parents flags)'],
    [
      '',
      'show-hidden',
      'show hidden snaps (snaps are marked as hidden typically when the following tag has the same files/config)',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  remoteOp = true; // should support log against remote
  skipWorkspace = true;
  arguments = [{ name: 'id', description: 'component-id or component-name' }];

  constructor(private componentLog: ComponentLogMain) {}

  async report(
    [id]: [string],
    { remote = false, parents = false, oneLine = false, fullHash = false, fullMessage, showHidden }: LogFlags
  ) {
    if (!parents && !oneLine) {
      fullHash = true;
      fullMessage = true;
    }
    const logOpts: LogOpts = { isRemote: remote, shortHash: !fullHash, shortMessage: !fullMessage, showHidden };
    if (parents) {
      const logs = await this.componentLog.getLogsWithParents(id, logOpts);
      return logs.join('\n');
    }
    const logs = await this.componentLog.getLogs(id, logOpts);
    if (oneLine) {
      return logOneLine(logs.reverse());
    }
    // reverse to show from the latest to earliest
    return logs.reverse().map(paintLog).join('\n');
  }

  async json(
    [id]: [string],
    { remote = false, parents = false, oneLine = false, fullHash = false, fullMessage, showHidden }: LogFlags
  ) {
    if (!parents && !oneLine) {
      fullHash = true;
      fullMessage = true;
    }
    const logOpts: LogOpts = { isRemote: remote, shortHash: !fullHash, shortMessage: !fullMessage, showHidden };
    if (parents) {
      return this.componentLog.getLogsWithParents(id, logOpts);
    }
    return this.componentLog.getLogs(id, logOpts);
  }
}

export function paintAuthor(email: string | null | undefined, username: string | null | undefined) {
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
  const { message, date, tag, hash, username, email, deleted, deprecated } = log;
  const deletedStr = deleted ? c.red(' [deleted]') : '';
  const deprecatedStr = !deleted && deprecated ? c.yellow(' [deprecated]') : '';
  const title = tag ? `tag ${tag} (${hash})${deletedStr}${deprecatedStr}\n` : `snap ${hash}\n`;
  return (
    c.yellow(title) +
    paintAuthor(email, username) +
    (date ? c.white(`date: ${date}\n`) : '') +
    (message ? c.white(`\n      ${message}\n`) : '')
  );
}

/**
 * table with no style and no borders, just to align the columns.
 */
export function getEmptyTableWithoutStyle() {
  return new Table({
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
}

function logOneLine(logs: LegacyComponentLog[]) {
  const table = getEmptyTableWithoutStyle();

  logs.map(({ hash, tag, username, date, message }) =>
    table.push([hash, tag || '', username || '', date || '', message || ''])
  );

  return table.toString();
}
