import chalk from 'chalk';

export const formatCompileResults = (compileResults, verbose) => {

  // const r = compileResults.map(compileResult =>  ({
  //   extensionId: compileResult.extensionId,
  //   results: compileResult.results?.results,
  //   status: 'SUCCESS'
  // }))
  // console.log('--ss-> ', compileResults)

  const r = compileResults.map(compileResult => ({
    extensionId: compileResult.extensionId,
    resultsForExtension: compileResult.results?.results?.map(resultForExtension => ({
      component: resultForExtension.component,
      componentFilesAsString: componentFilesArrayToString(resultForExtension.buildResults)
    }))
  }))

  // console.log('r1: ',r[0])
  // console.log('r2: ',r[0].resultsForExtension)


  // console.log('--ss-> ', compileResults.map(compileResult => ({
  //   extensionId: compileResult.extensionId,
  //   results: compileResult.results?.results
  // })))





  // return compileResults.map(compileResults => ({
  //     filesPath: compileResults,
  //     status: 'SUCCESS',
  // }))
};

const componentFilesArrayToString = (componentFiles) => {
  // console.log('---> ', componentFiles);

  // let outputString = `STATUS\t\tCOMPONENT ID`;
  const t = componentFiles
    .reduce((outputString, filePath) => (
      outputString + `${chalk.green('√')} SUCCESS\t${filePath}\n`
    ), ` ${chalk.underline('STATUS\tCOMPONENT ID\n')}`  )



    console.log('', t);

    return t;
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
