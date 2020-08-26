import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) =>
  compileResults
    .map((componentResult) => ({
      componentId: componentResult.component,
      files: componentResult.buildResults,
      status: 'SUCCESS',
    }))
    .reduce((outputString, result) => {
      outputString += `${chalk.green('√')} ${result.status}\t${result.componentId}`;
      if (verbose) {
        outputString += ':';
        outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '\n');
      }
      outputString += '\n';
      return outputString;
    }, '');
