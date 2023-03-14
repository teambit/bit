import path from 'path';
import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { WorkspaceConfigFilesMain } from './workspace-config-files.main.runtime';

type Flags = { dryRun?: boolean; noDedupe?: boolean; dryRunWithContent?: boolean; clean?: boolean; silent?: boolean };

export default class WriteConfigsCmd implements Command {
  name = 'write-configs';
  description = 'EXPERIMENTAL. write config files in the workspace. useful for IDEs';
  alias = '';
  group = 'development';
  options = [
    ['c', 'clean', 'delete existing config files from the workspace. highly recommended to run it with "--dry-run" first'],
    ['s', 'silent', 'do not prompt for confirmation'],
    ['', 'no-dedupe', "write configs inside each one of the component's dir, avoid deduping"],
    ['', 'dry-run', 'show the paths that configs will be written per env'],
    [
      '',
      'dry-run-with-content',
      'use with --json flag. show the config content and the paths it will be written per env',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report(_args, flags: Flags) {
    const { cleanResults, writeResults } = await this.json(_args, flags);
    if (flags.dryRunWithContent) {
      throw new Error(`use --json flag along with --dry-run-with-content`);
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
          .map((str) => `  ${str}`)
          .join('\n');
        return `The following paths are according to env(s) ${chalk.bold(result.envIds.join(', '))}\n${paths}`;
      })
      .join('\n\n');
    return `${cleanResultsOutput}${writeTitle}\n${writeOutput}`;
  }

  async json(_args, flags: Flags) {
    const { clean, silent, noDedupe, dryRunWithContent } = flags;
    const dryRun = dryRunWithContent ? true : flags.dryRun;
    const { cleanResults, writeResults } = await this.workspaceConfigFilesMain.writeConfigFiles({
      clean,
      dedupe: !noDedupe,
      dryRun,
      dryRunWithContent,
      silent,
    });

    if (dryRun) {
      const writeJson = dryRunWithContent ? writeResults : writeResults.map((s) => omit(s, ['content']));
      // return JSON.stringify({ cleanResults, writeResults: writeJson }, undefined, 2);
      return { cleanResults, writeResults: writeJson };
    }
    return { cleanResults, writeResults };
  }
}
