import chalk from 'chalk';

const resultsForExtensionArrayToString = (resultsForExtension, verbose) => {
  return resultsForExtension.reduce(
    (outputString, resultForExtension) =>
      `${outputString}
    ${chalk.green('√')} SUCCESS\t${resultForExtension.component}\n
     ${verbose ? resultForExtension.componentFilesAsString : ''}\n`,
    '\n'
  );
};

const output = (compileResults, verbose) => {
  return compileResults
    .map((compileResult) => ({
      extensionId: compileResult.extensionId,
      resultsForExtension: compileResult.results?.results?.map((resultForExtension) => ({
        component: resultForExtension.component,
        componentFilesAsString: verboseComponentFilesArrayToString(resultForExtension.buildResults),
      })),
    }))
    .reduce(
      (outputString, compileResult) =>
        `${outputString}
    ${resultsForExtensionArrayToString(compileResult.resultsForExtension, verbose)}`,
      ` ${chalk.underline('STATUS\t\tCOMPONENT ID')}`
    );
};

const verboseComponentFilesArrayToString = (componentFiles) => {
  return componentFiles.reduce((outputString, filePath) => outputString + `\t - ${filePath}\n`, ``);
};

export const formatWatchPathsSortByComponent = (watchPathsSortByComponent) => {
  return watchPathsSortByComponent.reduce(
    (outputString, watchPath) =>
      `${outputString}
    ${chalk.green('√')} SUCCESS\t${watchPath.componentId}\n
    \t - ${watchPath.absPaths?.join('\n')}\n\n`,
    ` ${chalk.underline('STATUS\t\tCOMPONENT ID')}\n`
  );
};

export const formatCompileResults = (compileResults, verbose) => output(compileResults, verbose);
