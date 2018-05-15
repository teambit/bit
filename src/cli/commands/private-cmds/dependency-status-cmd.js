/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { dependencyStatus } from '../../../api/consumer';
import type { DependencyStatusResult, DependencyStatusProps } from '../../../consumer/component-ops/dependency-status';

export default class DependencyStatus extends Command {
  name = 'dependency-status [mainFile...]';
  private = true;
  description = 'returns the status of the dependency status of bit map against bit dependencies';
  alias = '';
  opts = [];
  migration = true;

  action([mainFile]: [string[]]): Promise<DependencyStatusResult> {
    const dependencyStatusProps: DependencyStatusProps = {
      mainFile
    };
    return dependencyStatus(dependencyStatusProps);
  }
  report(dependencyStatusResult: DependencyStatusResult): string {
    if (dependencyStatusResult.missingFiles.length === 0) {
      const output = chalk.green('All files in dependency tree are marked as components');
      return output;
    }
    let output = chalk.green('The following file exist in dependency tree but are not a component:\n');
    const files = dependencyStatusResult.missingFiles.map((missingFile) => {
      const file = chalk.bold(missingFile);
      return file;
    });
    output += files.join('\n');
    return output;
  }
}
