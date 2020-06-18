import R from 'ramda';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { getComponentLogs } from '../../../api/consumer';
import { paintLog } from '../../chalk-box';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Log implements LegacyCommand {
  name = 'log <id>';
  description = `show components(s) tag history.\n  https://${BASE_DOCS_DOMAIN}/docs/view#log`;
  alias = '';
  opts = [['r', 'remote', 'show log of a remote component']] as CommandOptions;
  migration = true;
  remoteOp = true; // should support log against remote
  skipWorkspace = true;

  action([id]: [string], { remote = false }: { remote: boolean }): Promise<any> {
    return getComponentLogs(id, remote).then(logs => {
      Object.keys(logs).forEach(key => (logs[key].tag = key));
      return R.reverse(R.values(logs)).map(
        R.evolve({
          date: n => new Date(parseInt(n)).toLocaleString()
        })
      );
    });
  }

  report(
    logs: Array<{
      message: string;
      tag: string;
      date: string;
      username: string | null | undefined;
      email: string | null | undefined;
    }>
  ): string {
    return logs.map(paintLog).join('\n');
  }
}
