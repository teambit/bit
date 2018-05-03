/** @flow */
import Command from '../../command';
import chalk from 'chalk';
import { dependencyStatus } from '../../../api/consumer';
import { DependencyStatusResult } from '../../../consumer/component-ops/dependency-status';
import logger from '../../../logger/logger';

export default class DependencyStatus extends Command {
  name = 'dependency-status <main_file> ';
  private = true;
  description = 'returns the status of the dependency status of bit map against bit dependencies';
  alias = '';
  opts = [];
  migration = true;

  action([main_file]: [string]): Promise<DependencyStatusResult> {
    logger.info('main file is ' +  main_file);
    const dependencyStatusProps: DependencyStatusProps = {
      main_file : main_file
    };
    return dependencyStatus(dependencyStatusProps);
}

report(dependencyStatusResult: DependencyStatusResul): string {
  if(dependencyStatusResult.missing_files.length == 0) {
    const output = chalk.green(`All files in dependency tree are marked as components`);
    return output;  
  } 
  let output = chalk.green(`The following file exist in dependency tree but are not a component:\n`);
  output += dependencyStatusResult.missing_files.map((missing_file) => {   
    const file = chalk.bold(missing_file + '\n');    
    return file;
  });
  return output;
}
}
