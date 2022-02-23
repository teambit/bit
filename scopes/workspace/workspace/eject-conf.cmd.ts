import path from 'path';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';

import { EjectConfOptions, EjectConfResult, Workspace } from './workspace';

type EjectConfArgs = [string];
// From the cli we might get those as string in case we run it like --propagate true (return string) as opposed to only --propagate
type EjectConfOptionsCLI = {
  propagate: string | boolean | undefined;
  override: string | boolean | undefined;
};

export default class EjectConfCmd implements Command {
  name = 'eject-conf <pattern>';
  description = 'eject components configuration (create a `component.json` file)';
  extendedDescription = `${PATTERN_HELP('eject-conf')}`;
  alias = '';
  group = 'development';
  options = [
    ['p', 'propagate', 'mark propagate true in the config file'],
    ['o', 'override', 'override file if exist'],
  ] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report(args: EjectConfArgs, options: EjectConfOptionsCLI): Promise<string> {
    const ejectResult = await this.json(args, options);
    const paths = ejectResult
      .map((result) => result.configPath)
      .map((p) => path.relative(this.workspace.path, p))
      .join('\n');
    return chalk.green(`successfully ejected config in the following path(s)
${chalk.bold(paths)}`);
  }

  async json([pattern]: EjectConfArgs, options: EjectConfOptionsCLI): Promise<EjectConfResult[]> {
    const ejectOptions = options;
    if (ejectOptions.propagate === 'true') {
      ejectOptions.propagate = true;
    }
    if (ejectOptions.override === 'true') {
      ejectOptions.override = true;
    }

    const componentIds = await this.workspace.idsByPattern(pattern);
    const results = await this.workspace.ejectMultipleConfigs(componentIds, ejectOptions as EjectConfOptions);
    return results;
  }
}
