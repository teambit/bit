import chalk from 'chalk';

import { dependencyStatus } from '../../../api/consumer';
import { DependencyStatusProps, DependencyStatusResult } from '../../../consumer/component-ops/dependency-status';
import { LegacyCommand } from '../../legacy-command';

export default class DependencyStatus implements LegacyCommand {
  name = 'dependency-status [mainFile...]';
  private = true;
  description = 'returns the status of the dependency status of bit map against bit dependencies';
  alias = '';
  opts = [];
  migration = true;

  action([mainFile]: [string[]]): Promise<DependencyStatusResult> {
    const dependencyStatusProps: DependencyStatusProps = {
      mainFile,
    };
    return dependencyStatus(dependencyStatusProps);
  }
  report(dependencyStatusResult: DependencyStatusResult): string {
    if (dependencyStatusResult.missingFiles.length === 0) {
      const output = chalk.green('All files in dependency tree are marked as components');
      return output;
    }
    let output = chalk.red('The following file exist in dependency tree but are not a component:\n');
    const files = dependencyStatusResult.missingFiles.map((missingFile) => {
      const file = chalk.bold(missingFile);
      return file;
    });
    output += files.join('\n');
    return output;
  }
}
