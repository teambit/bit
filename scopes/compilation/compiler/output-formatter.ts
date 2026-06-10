import { errorSymbol, formatItem } from '@teambit/cli';
import type { BuildResult } from './workspace-compiler';

export const formatCompileResults = (compileResults: BuildResult[], verbose: boolean) => {
  const lines = compileResults
    .filter((result) => verbose || result.errors.length > 0)
    .map((componentResult: BuildResult) => {
      const failed = componentResult.errors.length > 0;
      const symbol = failed ? errorSymbol : undefined;
      const suffix = failed ? ' ... failed' : '';
      let line = formatItem(`${componentResult.component}${suffix}`, symbol);
      if (verbose && componentResult.buildResults?.length) {
        line += '\n' + componentResult.buildResults.map((file) => `\t\t - ${file}`).join('\n');
      }
      return line;
    });
  return lines.join(verbose ? '\n\n' : '\n');
};
