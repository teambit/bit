import { Command, CommandOptions } from '@teambit/cli';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { paintLog } from '@teambit/legacy/dist/cli/chalk-box';
import { ComponentLogMain } from './component-log.main.runtime';

export default class LogCmd implements Command {
  name = 'log <id>';
  shortDescription = 'show components(s) version history';
  group = 'info';
  description = `show components(s) tag history.\n  https://${BASE_DOCS_DOMAIN}/reference/cli-reference#log`;
  alias = '';
  options = [
    ['r', 'remote', 'show log of a remote component'],
    ['', 'parents', 'EXPERIMENTAL. show parents and lanes data'],
  ] as CommandOptions;
  migration = true;
  remoteOp = true; // should support log against remote
  skipWorkspace = true;

  constructor(private componentLog: ComponentLogMain) {}

  async report([id]: [string], { remote = false, parents = false }: { remote: boolean; parents: boolean }) {
    if (parents) {
      const logs = await this.componentLog.getLogsWithParents(id);
      return logs.join('\n');
    }
    const logs = await this.componentLog.getLogs(id, remote);
    return logs.reverse().map(paintLog).join('\n');
  }
}
