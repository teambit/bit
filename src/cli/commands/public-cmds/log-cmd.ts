import { getComponentLogs } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { ComponentLog } from '../../../scope/models/model-component';
import { paintLog } from '../../chalk-box';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Log implements LegacyCommand {
  name = 'log <id>';
  shortDescription = 'show components(s) version history';
  group: Group = 'info';
  description = `show components(s) tag history.\n  https://${BASE_DOCS_DOMAIN}/docs/view#log`;
  alias = '';
  opts = [['r', 'remote', 'show log of a remote component']] as CommandOptions;
  migration = true;
  remoteOp = true; // should support log against remote
  skipWorkspace = true;

  async action([id]: [string], { remote = false }: { remote: boolean }): Promise<any> {
    const logs = await getComponentLogs(id, remote);
    logs.forEach((log) => {
      log.date = log.date ? new Date(parseInt(log.date)).toLocaleString() : undefined;
    });
    return logs.reverse();
  }

  report(logs: ComponentLog[]): string {
    return logs.map(paintLog).join('\n');
  }
}
