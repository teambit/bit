import chalk from 'chalk';
import * as nodePath from 'path';
import Command from '../../command';
import { ejectConf } from '../../../api/consumer';
import { EjectConfResult } from '../../../consumer/component-ops/eject-conf';
import { PathOsBased } from '../../../utils/path';

type EjectConfCliResult = EjectConfResult & {
  ejectPathRelativeToCwd: PathOsBased;
};

export default class EjectConf extends Command {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  opts = [];
  loader = true;
  migration = true;

  async action([id]: [string], { path }: { path?: string }): Promise<EjectConfCliResult> {
    const cwd = process.cwd();
    const res = await ejectConf(id);
    res.ejectPathRelativeToCwd = nodePath.relative(cwd, res.ejectedFullPath);
    return res;
  }

  report(ejectResults: EjectConfCliResult): string {
    return `successfully ejected ${chalk.bold(ejectResults.id)} configuration to:\n${chalk.green(
      ejectResults.ejectPathRelativeToCwd
    )}`;
  }
}
