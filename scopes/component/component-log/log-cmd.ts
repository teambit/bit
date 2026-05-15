import c from 'chalk';
import Table from 'cli-table';
import type { Command, CommandOptions } from '@teambit/cli';
import { warnSymbol, errorSymbol } from '@teambit/cli';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentLogMain, LogOpts } from './component-log.main.runtime';
import { logCommand } from './component-log.commands';

type LogFlags = {
  remote?: boolean;
  parents?: boolean;
  oneLine?: boolean;
  fullHash?: boolean;
  fullMessage?: boolean;
  showHidden?: boolean;
};
export default class LogCmd implements Command {
  name = logCommand.name;
  description = logCommand.description;
  helpUrl = logCommand.helpUrl;
  extendedDescription = logCommand.extendedDescription;
  group = logCommand.group;
  alias = logCommand.alias;
  options = logCommand.options;
  remoteOp = logCommand.remoteOp; // should support log against remote
  skipWorkspace = logCommand.skipWorkspace;
  arguments = logCommand.arguments;

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
  const deletedStr = deleted ? ` ${c.red(`${errorSymbol} deleted`)}` : '';
  const deprecatedStr = !deleted && deprecated ? ` ${c.yellow(`${warnSymbol} deprecated`)}` : '';
  const title = tag ? `tag ${tag} (${hash})` : `snap ${hash}`;
  return (
    c.yellow(title) +
    deletedStr +
    deprecatedStr +
    '\n' +
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
