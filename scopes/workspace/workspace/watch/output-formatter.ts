import chalk from 'chalk';
import { OnComponentEventResult } from '../on-component-events';

const verboseComponentFilesArrayToString = (componentFiles) => {
  return componentFiles.reduce((outputString, filePath) => `${outputString} \t - ${filePath}\n`, ``);
};

const resultsForExtensionArrayToString = (resultsForExtension, verbose) => {
  return resultsForExtension.reduce(
    (outputString, resultForExtension) =>
      `${outputString}${chalk.green('√')}SUCCESS\t${resultForExtension.component}\n
     ${verbose ? resultForExtension.componentFilesAsString : ''}\n`,
    ''
  );
};

export const formatWatchPathsSortByComponent = (trackDirs) => {
  return Object.keys(trackDirs).reduce(
    (outputString, watchPath) =>
      `${outputString}
    ${chalk.green('√')} SUCCESS\t${trackDirs[watchPath]}\n
    \t - ${watchPath}\n\n`,
    ` ${chalk.underline('STATUS\t\tCOMPONENT ID')}\n`
  );
};

/**
 * todo: this was implemented incorrectly.
 * the original idea of `SerializableResults` was to have each one of the aspects registered to the slot, the
 * ability to have their own formatting to their results, and then `toString()` method to print them.
 * Here, the printing is specifically to the Compiler aspect. It should move to where it belongs.
 */
export function formatCompileResults(compileResults: OnComponentEventResult[], verbose: boolean) {
  if (!compileResults.length || !Array.isArray(compileResults)) return '';
  return compileResults
    .filter((compileResult) => compileResult.results?.results && Array.isArray(compileResult.results?.results))
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
      ` ${chalk.underline('STATUS\tCOMPONENT ID')}`
    );
}
