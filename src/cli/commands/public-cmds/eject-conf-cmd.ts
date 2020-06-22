import chalk from 'chalk';
import * as nodePath from 'path';
import { LegacyCommand } from '../../legacy-command';
import { ejectConf } from '../../../api/consumer';
import { EjectConfResult } from '../../../consumer/component-ops/eject-conf';
import { PathOsBased } from '../../../utils/path';

type EjectConfCliResult = EjectConfResult & {
  ejectPathRelativeToCwd: PathOsBased;
};

export default class EjectConf implements LegacyCommand {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  private = true;
  opts = [];
  loader = true;
  migration = true;

  async action([id]: [string]): Promise<EjectConfCliResult> {
    const cwd = process.cwd();
    const res = await ejectConf(id);
    const ejectPathRelativeToCwd = nodePath.relative(cwd, res.ejectedPath);
    return Object.assign({}, res, { ejectPathRelativeToCwd });
  }

  report(ejectResults: EjectConfCliResult): string {
    return `successfully ejected ${chalk.bold(ejectResults.id)} configuration to:\n${chalk.green(
      ejectResults.ejectPathRelativeToCwd
    )}`;
  }
}
