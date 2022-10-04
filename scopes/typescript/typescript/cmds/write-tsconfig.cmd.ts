import path from 'path';
import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { TypescriptMain } from '../typescript.main.runtime';

export default class WriteTsconfigCmd implements Command {
  name = 'write-tsconfig';
  description = 'EXPERIMENTAL. write tsconfig.json files in the component directories';
  alias = '';
  group = 'development';
  options = [
    ['c', 'clean', 'delete tsconfig files from the workspace. highly recommended to run it with "--dry-run" first'],
    ['s', 'silent', 'do not prompt for confirmation'],
    ['', 'no-dedupe', "write tsconfig.json inside each one of the component's dir, avoid deduping"],
    ['', 'dry-run', 'show the paths that tsconfig will be written per env'],
    ['', 'dry-run-with-tsconfig', 'show the tsconfig.json content and the paths it will be written per env'],
  ] as CommandOptions;

  constructor(private tsMain: TypescriptMain) {}

  async report(
    _args,
    {
      clean,
      silent,
      dryRun,
      noDedupe,
      dryRunWithTsconfig,
    }: { dryRun?: boolean; noDedupe?: boolean; dryRunWithTsconfig?: boolean; clean?: boolean; silent?: boolean }
  ) {
    const { writeResults, cleanResults } = await this.tsMain.writeTsconfigJson({
      clean,
      dedupe: !noDedupe,
      dryRun: dryRun || dryRunWithTsconfig,
      dryRunWithTsconfig,
      silent,
    });
    const cleanResultsOutput = cleanResults
      ? `${chalk.green(`the following paths were deleted`)}\n${cleanResults.join('\n')}\n\n`
      : '';
    if (dryRunWithTsconfig) {
      return JSON.stringify(writeResults, undefined, 2);
    }
    if (dryRun) {
      const withoutTsconfig = writeResults.map((s) => omit(s, ['tsconfig']));
      return JSON.stringify(withoutTsconfig, undefined, 2);
    }
    const totalFiles = writeResults.map((r) => r.paths.length).reduce((acc, current) => acc + current);
    const writeTitle = chalk.green(`${totalFiles} files have been written successfully`);
    const writeOutput = writeResults
      .map((result) => {
        const paths = result.paths
          .map((p) => path.join(p, 'tsconfig.json'))
          .map((str) => `  ${str}`)
          .join('\n');
        return `The following paths were written according to env ${chalk.bold(result.envId)}\n${paths}`;
      })
      .join('\n\n');
    return `${cleanResultsOutput}${writeTitle}\n${writeOutput}`;
  }
}
