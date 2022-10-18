import path from 'path';
import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { TypescriptMain } from '../typescript.main.runtime';

type Flags = { dryRun?: boolean; noDedupe?: boolean; dryRunWithTsconfig?: boolean; clean?: boolean; silent?: boolean };

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
    [
      '',
      'dry-run-with-tsconfig',
      'use with --json flag. show the tsconfig.json content and the paths it will be written per env',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private tsMain: TypescriptMain) {}

  async report(_args, flags: Flags) {
    const { cleanResults, writeResults } = await this.json(_args, flags);
    if (flags.dryRunWithTsconfig) {
      throw new Error(`use --json flag along with --dry-run-with-tsconfig`);
    }
    const isDryRun = flags.dryRun;
    const cleanResultsOutput = cleanResults
      ? `${chalk.green(`the following paths ${isDryRun ? 'will be' : 'were'} deleted`)}\n${cleanResults.join('\n')}\n\n`
      : '';

    const totalFiles = writeResults.map((r) => r.paths.length).reduce((acc, current) => acc + current);
    const writeTitle = isDryRun
      ? chalk.green(`${totalFiles} files will be written`)
      : chalk.green(`${totalFiles} files have been written successfully`);
    const writeOutput = writeResults
      .map((result) => {
        const paths = result.paths
          .map((p) => path.join(p, 'tsconfig.json'))
          .map((str) => `  ${str}`)
          .join('\n');
        return `The following paths are according to env(s) ${chalk.bold(result.envIds.join(', '))}\n${paths}`;
      })
      .join('\n\n');
    return `${cleanResultsOutput}${writeTitle}\n${writeOutput}`;
  }

  async json(_args, flags: Flags) {
    const { clean, silent, noDedupe, dryRunWithTsconfig } = flags;
    const dryRun = dryRunWithTsconfig ? true : flags.dryRun;
    const { cleanResults, writeResults } = await this.tsMain.writeTsconfigJson({
      clean,
      dedupe: !noDedupe,
      dryRun,
      dryRunWithTsconfig,
      silent,
    });

    if (dryRun) {
      const writeJson = dryRunWithTsconfig ? writeResults : writeResults.map((s) => omit(s, ['tsconfig']));
      // return JSON.stringify({ cleanResults, writeResults: writeJson }, undefined, 2);
      return { cleanResults, writeResults: writeJson };
    }
    return { cleanResults, writeResults };
  }
}
