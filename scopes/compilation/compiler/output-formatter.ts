import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) =>
  compileResults
    .map((componentResult) => ({
      componentId: componentResult.component.name,
      files: componentResult.buildResults,
      status: componentResult.errors.length ? 'FAILURE' : 'SUCCESS',
      icon: componentResult.errors.length ? chalk.red('✗') : chalk.green('✔'),
    }))
    .reduce((outputString, result) => {
      outputString += `${result.icon} ${result.status}\t${result.componentId}`;
      if (verbose) {
        outputString += ':';
        outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '\n');
      }
      outputString += '\n';
      return outputString;
    }, '');
