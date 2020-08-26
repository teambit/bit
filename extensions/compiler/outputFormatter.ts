import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) =>
  compileResults
    .map((componentResults) => ({
      componentId: componentResults.component,
      files: componentResults.buildResults,
      status: 'SUCCESS',
    }))
    .reduce((outputString, result) => {
      outputString += `${chalk.green('√')} ${result.status}\t${result.componentId}`;
      if (verbose) {
        outputString += ':\n';
        outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '');
      }
      outputString += '\n';
      return outputString;
    }, '');
