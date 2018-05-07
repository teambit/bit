/** @flow */
import Command from '../../command';
import chalk from 'chalk';
import { dependencyStatus } from '../../../api/consumer';
import { DependencyStatusResult } from '../../../consumer/component-ops/dependency-status';
import logger from '../../../logger/logger';

export default class DependencyStatus extends Command {
  name = 'dependency-status [mainFile...]';
  private = true;
  description = 'returns the status of the dependency status of bit map against bit dependencies';
  alias = '';
  opts = [];
  migration = true;

  action([mainFile]: [string[]]): Promise<DependencyStatusResult> {
    const dependencyStatusProps: DependencyStatusProps = {
      mainFile : mainFile
    };
    return dependencyStatus(dependencyStatusProps);
}

report(dependencyStatusResult: DependencyStatusResult): string {
    if(dependencyStatusResult.missingFiles.length === 0) {
      const output = chalk.green(`All files in dependency tree are marked as components`);
      return output;  
    } 
    let output = chalk.green(`The following file exist in dependency tree but are not a component:\n`);
    output += dependencyStatusResult.missingFiles.map((missingFile) => {   
      const file = chalk.bold(missingFile + '\n');    
      return file;
    });
    return output;
}
}
