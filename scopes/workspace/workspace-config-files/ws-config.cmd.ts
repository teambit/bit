/* eslint-disable max-classes-per-file */

import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import {
  WorkspaceConfigFilesMain,
  WriteConfigFilesResult
} from './workspace-config-files.main.runtime';
import { formatWriteOutput } from './format-outputs';

export type Flags = {
  dryRun?: boolean;
  noDedupe?: boolean;
  dryRunWithContent?: boolean;
  clean?: boolean;
  silent?: boolean;
};

export class WsConfigCmd implements Command {
  name = 'ws-config <sub-command>';
  alias = 'workspace-config';
  description = 'manage workspace config files';
  options = [];
  group = 'development';
  commands: Command[] = [];
  // helpUrl = '';

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "ws-config", please run "bit ws-config --help" to list the subcommands`
    );
  }
}

export default class WsConfigWriteCmd implements Command {
  name = 'write';
  description = 'EXPERIMENTAL. write config files in the workspace. useful for IDEs';
  alias = '';
  group = 'development';
  options = [
    [
      'c',
      'clean',
      'delete existing config files from the workspace. highly recommended to run it with "--dry-run" first',
    ],
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
    const results = (await this.json(_args, flags)) as WriteConfigFilesResult;
    if (flags.dryRunWithContent) {
      throw new Error(`use --json flag along with --dry-run-with-content`);
    }
    return formatWriteOutput(results, flags);
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
      const aspectsWritersResults = dryRunWithContent
        ? writeResults.aspectsWritersResults
        : writeResults.aspectsWritersResults.map((s) => omit(s, ['content']));
      // return JSON.stringify({ cleanResults, writeResults: writeJson }, undefined, 2);
      return {
        cleanResults,
        writeResults: { totalWrittenFiles: writeResults.totalWrittenFiles, aspectsWritersResults },
      };
    }
    return { cleanResults, writeResults };
  }
}
