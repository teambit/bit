import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) => {

  // const r = compileResults.map(compileResult =>  ({
  //   extensionId: compileResult.extensionId,
  //   results: compileResult.results?.results,
  //   status: 'SUCCESS'
  // }))
  // console.log('--ss-> ', compileResults)

  // const r = compileResults.map(compileResult => ({
  //   extensionId: compileResult.extensionId,
  //   resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
  //     component: resultForExtension.component,
  //     componentFilesAsString: componentFilesArrayToString(resultForExtension.buildResults)
  //   }))
  // }))
  // const t = output(compileResults);
  const t = verboseOutput(compileResults);
  console.log('',t)
  // return t;

  // console.log('r1: ',r[0])
  // console.log('r2: ',r[0].resultsForExtension)
};

// const output = (compileResults) => {
//   return compileResults.map(compileResult => ({
//     extensionId: compileResult.extensionId,
//     resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
//       component: resultForExtension.component,
//       componentFilesAsString: componentFilesArrayToString(resultForExtension.buildResults)
//     }))
//   })).reduce((outputString, compileResult) => (
//     outputString + `${chalk.green('√')} SUCCESS\t${compileResult.extensionId}\n`
//     + `\t${resultsForExtensionArrayToString(compileResult.resultsForExtension)}`
//   ), ` ${chalk.underline('STATUS\tEXTENSION ID\n')}`)
// }

// const resultsForExtensionArrayToString = (resultsForExtension) => {
//   return resultsForExtension.reduce((outputString, resultForExtension) => (
//     outputString + ` - ${chalk.green('√')} SUCCESS\t${resultForExtension.component}\n`
//   ),'Components:\n')
// }

// const componentFilesArrayToString = (componentFiles) => {
//   return componentFiles
//     .reduce((outputString, filePath) => (
//       outputString + ` - ${chalk.green('√')} SUCCESS\t${filePath}\n`
//     ), ` ${chalk.underline('STATUS\tCOMPONENT ID\n')}`)
// }


// Verbose
// const verboseOutput = (compileResults) => {
//   return compileResults.map(compileResult => ({
//     extensionId: compileResult.extensionId,
//     resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
//       component: resultForExtension.component,
//       componentFilesAsString: verboseComponentFilesArrayToString(resultForExtension.buildResults)
//     }))
//   })).reduce((outputString, compileResult) => (
//     outputString + `${chalk.green('√')} SUCCESS\t${compileResult.extensionId}`
//     + `\t${verboseResultsForExtensionArrayToString(compileResult.resultsForExtension)}\n`
//   ), ` ${chalk.underline('STATUS\tEXTENSION ID\n')}`)
// }

const verboseOutput = (compileResults) => {
  return compileResults.map(compileResult => ({
    extensionId: compileResult.extensionId,
    resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
      component: resultForExtension.component,
      componentFilesAsString: verboseComponentFilesArrayToString(resultForExtension.buildResults)
    }))
  })).reduce((outputString, compileResult) => (
    outputString + `${verboseResultsForExtensionArrayToString(compileResult.resultsForExtension)}`
  ), ` ${chalk.underline('STATUS\tCOMPONENT ID')}`)
}

const verboseResultsForExtensionArrayToString = (resultsForExtension) => {
  return resultsForExtension.reduce((outputString, resultForExtension) => (
    outputString + `${chalk.green('√')} SUCCESS\t${resultForExtension.component}:\n`
    + `${resultForExtension.componentFilesAsString}\n`
  ),'\n')
}

const verboseComponentFilesArrayToString = (componentFiles) => {
  return componentFiles
    .reduce((outputString, filePath) => (
      outputString + `\t - ${filePath}\n`
    ), ``)
}





// export const formatCompileResults = (compileResults, verbose) =>
//   compileResults
//     .map((componentResult) => ({
//       componentId: componentResult.component,
//       files: componentResult.buildResults,
//       status: 'SUCCESS',
//     }))
//     .reduce((outputString, result) => {
//       outputString += `${chalk.green('√')} ${result.status}\t${result.componentId}`;
//       if (verbose) {
//         outputString += ':';
//         outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '\n');
//       }
//       outputString += '\n';
//       return outputString;
//     }, '');
