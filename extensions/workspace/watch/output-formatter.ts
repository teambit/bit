import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) => (
  output(compileResults, verbose)
)

const output = (compileResults, verbose) => {
  return compileResults.map(compileResult => ({
    extensionId: compileResult.extensionId,
    resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
      component: resultForExtension.component,
      componentFilesAsString: verboseComponentFilesArrayToString(resultForExtension.buildResults)
    }))
  })).reduce((outputString, compileResult) => (
    outputString + `${resultsForExtensionArrayToString(compileResult.resultsForExtension, verbose)}`
  ), ` ${chalk.underline('STATUS\tCOMPONENT ID')}`)
}

const resultsForExtensionArrayToString = (resultsForExtension, verbose) => {
  return resultsForExtension.reduce((outputString, resultForExtension) => (
    outputString + `${chalk.green('√')} SUCCESS\t${resultForExtension.component}\n`
    + `${verbose ? resultForExtension.componentFilesAsString : ''}\n`
  ),'\n')
}

const verboseComponentFilesArrayToString = (componentFiles) => {
  return componentFiles
    .reduce((outputString, filePath) => (
      outputString + `\t - ${filePath}\n`
    ), ``)
}
