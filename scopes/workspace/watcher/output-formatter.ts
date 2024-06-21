import { Logger } from '@teambit/logger';
import { CompilerAspect } from '@teambit/compiler';
import { OnComponentEventResult } from '@teambit/workspace';
import chalk from 'chalk';
import { compact } from 'lodash';
import { RootDirs } from './watcher';

export function formatWatchPathsSortByComponent(trackDirs: RootDirs) {
  const title = ` ${chalk.underline('STATUS\tCOMPONENT ID')}\n`;
  return Object.keys(trackDirs).reduce((outputString, watchPath) => {
    const componentId = trackDirs[watchPath];
    const formattedWatchPath = `\t\t - ${watchPath}\n`;
    return `${outputString}${Logger.successSymbol()} SUCCESS\t${componentId}\n${formattedWatchPath}`;
  }, title);
}

export function formatCompileResults(compileResults: OnComponentEventResult[]) {
  if (!compileResults.length) return '';
  return compact(
    compileResults
      // currently, we are interested only in the compiler results
      .filter((compileResult) => compileResult.extensionId === CompilerAspect.id)
      .map((compileResult) => compileResult.results.toString())
  ).join('\n');
}
