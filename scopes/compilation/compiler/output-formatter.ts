import chalk from 'chalk';
import { errorSymbol, successSymbol, warnSymbol, formatItem } from '@teambit/cli';
import type { BuildResult } from './workspace-compiler';

export const formatCompileResults = (compileResults: BuildResult[], verbose: boolean) => {
  const lines = compileResults
    .filter((result) => verbose || result.errors.length > 0 || result.skipped)
    .map((componentResult: BuildResult) => {
      const failed = componentResult.errors.length > 0;
      const skipped = componentResult.skipped;
      let symbol: string | undefined;
      let suffix = '';
      if (failed) {
        symbol = errorSymbol;
        suffix = ' ... failed';
      } else if (skipped) {
        symbol = warnSymbol;
        suffix = ` ... not compiled, ${skipped.reason}`;
      }
      let line = formatItem(`${componentResult.component}${suffix}`, symbol);
      if (verbose && componentResult.buildResults?.length) {
        line += '\n' + componentResult.buildResults.map((file) => `\t\t - ${file}`).join('\n');
      }
      return line;
    });
  return lines.join(verbose ? '\n\n' : '\n');
};

/**
 * the output of the watcher when a component is changed. the buildResults array always has only one item.
 */
export const formatWatchCompileResults = (buildResults: BuildResult[], verbose?: boolean) => {
  const buildResult = buildResults.find((result) => !result.skipped);
  if (!buildResult) return '';
  const title = ` ${chalk.underline('STATUS\tCOMPONENT ID')}`;
  const failed = buildResult.errors.length > 0;
  const status = failed ? `${errorSymbol} FAILURE` : `${successSymbol()} SUCCESS`;
  const files = verbose ? `${buildResult.buildResults.map((filePath) => ` \t - ${filePath}`).join('\n')}\n` : '';
  return `${title}
  ${status}\t${buildResult.component}\n
  ${files}`;
};
