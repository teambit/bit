import { errorSymbol, warnSymbol, formatItem } from '@teambit/cli';
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
