import chalk from 'chalk';
import type { CleanConfigCmdFlags } from '../ws-config.cmd';

export function formatCleanOutput(cleanResults: string[] = [], flags: CleanConfigCmdFlags): string {
  const isDryRun = !!flags.dryRun;
  const cleanResultsOutput = getCleanResultsOutput(cleanResults, isDryRun);

  return `${cleanResultsOutput}`;
}

function getCleanResultsOutput(cleanResults: string[] | undefined, isDryRun: boolean) {
  const cleanResultsOutput = cleanResults
    ? `${chalk.green(
        `${cleanResults.length} config files ${isDryRun ? 'will be' : 'were'} deleted`
      )}\n  ${cleanResults.join('\n  ')}\n`
    : '';
  return cleanResultsOutput;
}
