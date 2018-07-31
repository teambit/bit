/** @flow */
import chalk from 'chalk';
import * as nodePath from 'path';
import Command from '../../command';
import { ejectConf } from '../../../api/consumer';
import type { EjectConfResult } from '../../../consumer/component-ops/eject-conf';
import type { PathOsBased } from '../../../utils/path';

type EjectConfCliResult = EjectConfResult & {
  ejectPathRelativeToCwd: PathOsBased
};

export default class EjectConf extends Command {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  opts = [['p', 'path <path>', 'ejecting configuration into a specific directory']];
  loader = true;
  migration = true;

  async action([id]: [string], { path }: { path?: string }): Promise<EjectConfCliResult> {
    const cwd = process.cwd();
    const res = await ejectConf(id, { ejectPath: path });
    res.ejectPathRelativeToCwd = nodePath.relative(cwd, res.ejectedFullPath);
    return res;
  }

  report(ejectResults: EjectConfCliResult): string {
    return `successfully ejected ${chalk.bold(ejectResults.id)} configuration to:\n${chalk.green(
      ejectResults.ejectPathRelativeToCwd
    )}`;
  }
}
