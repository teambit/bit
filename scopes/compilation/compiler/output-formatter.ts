import chalk from 'chalk';
import { Logger } from '@teambit/logger';
import type { BuildResult } from './workspace-compiler';

export const formatCompileResults = (compileResults: BuildResult[], verbose: boolean) =>
  compileResults
    .map((componentResult: BuildResult) => ({
      componentId: componentResult.component,
      files: componentResult.buildResults,
      status: componentResult.errors.length ? 'FAILURE' : 'SUCCESS',
      icon: componentResult.errors.length ? chalk.red('✗') : Logger.successSymbol(),
    }))
    .reduce((outputString, result) => {
      outputString += `${result.icon} ${result.status}\t${result.componentId}`;
      if (verbose) {
        outputString += ':';
        outputString += result?.files?.reduce((fileList, file) => `${fileList}\t\t - ${file}\n`, '\n');
      }
      outputString += '\n';
      return outputString;
    }, '');
