import chalk from 'chalk';
import { ComponentsStatus } from './compiler.cmd';

export const formatCompileResults = (compileResults: ComponentsStatus[], verbose: boolean) =>
  compileResults
    .map((componentResult: ComponentsStatus) => ({
      componentId: componentResult.component.id.fullName,
      files: componentResult.buildResults,
      status: componentResult.errors.length ? 'FAILURE' : 'SUCCESS',
      icon: componentResult.errors.length ? chalk.red('✗') : chalk.green('✔'),
    }))
    .reduce((outputString, result) => {
      outputString += `${result.icon} ${result.status}\t${result.componentId}`;
      if (verbose) {
        outputString += ':';
        // eslint-disable-next-line no-unsafe-optional-chaining
        outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '\n');
      }
      outputString += '\n';
      return outputString;
    }, '');
