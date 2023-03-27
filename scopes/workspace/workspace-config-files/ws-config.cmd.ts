/* eslint-disable max-classes-per-file */

import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { WorkspaceConfigFilesMain, WriteConfigFilesResult } from './workspace-config-files.main.runtime';
import { formatCleanOutput, formatListOutput, formatWriteOutput } from './format-outputs';

export type CleanConfigCmdFlags = {
  dryRun?: boolean;
  silent?: boolean;
};

export type WriteConfigCmdFlags = {
  dryRun?: boolean;
  writers?: string;
  noDedupe?: boolean;
  dryRunWithContent?: boolean;
  clean?: boolean;
  silent?: boolean;
};

const COMMAND_NAME = 'ws-config';

export class WsConfigCmd implements Command {
  name = `${COMMAND_NAME} <sub-command>`;
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

export class WsConfigWriteCmd implements Command {
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
    [
      'w',
      'writers <writers>',
      `only write config files for the given writers. use comma to separate multiple writers. use ${COMMAND_NAME} list to see all writers`,
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

  async report(_args, flags: WriteConfigCmdFlags) {
    const results = (await this.json(_args, flags)) as WriteConfigFilesResult;
    if (flags.dryRunWithContent) {
      throw new Error(`use --json flag along with --dry-run-with-content`);
    }
    return formatWriteOutput(results, flags);
  }

  async json(_args, flags: WriteConfigCmdFlags) {
    const { clean, silent, noDedupe, dryRunWithContent, writers } = flags;
    const dryRun = dryRunWithContent ? true : !!flags.dryRun;
    const { cleanResults, writeResults, wsDir } = await this.workspaceConfigFilesMain.writeConfigFiles({
      clean,
      dedupe: !noDedupe,
      dryRun,
      silent,
      writers: writers?.split(','),
    });

    if (dryRun) {
      const aspectsWritersResults = dryRunWithContent
        ? writeResults.aspectsWritersResults
        : writeResults.aspectsWritersResults.map((s) => omit(s, ['content']));
      // return JSON.stringify({ cleanResults, writeResults: writeJson }, undefined, 2);
      return {
        wsDir,
        cleanResults,
        writeResults: { totalWrittenFiles: writeResults.totalWrittenFiles, aspectsWritersResults },
      };
    }
    return { wsDir, cleanResults, writeResults };
  }
}

export class WsConfigCleanCmd implements Command {
  name = 'clean';
  description = 'EXPERIMENTAL. clean (delete) written config files in the workspace. useful for IDEs';
  alias = '';
  group = 'development';
  options = [
    ['s', 'silent', 'do not prompt for confirmation'],
    [
      'w',
      'writers <writers>',
      `only write config files for the given writers. use comma to separate multiple writers. use ${COMMAND_NAME} list to see all writers`,
    ],
    ['', 'dry-run', 'show the paths that configs will be written per env'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report(_args, flags: CleanConfigCmdFlags) {
    const results = await this.json(_args, flags);
    return formatCleanOutput(results, flags);
  }

  async json(_args, flags: WriteConfigCmdFlags) {
    const { silent, dryRun } = flags;
    const cleanResults = await this.workspaceConfigFilesMain.cleanConfigFiles({
      dryRun,
      silent,
      writers: flags.writers?.split(','),
    });
    return cleanResults;
  }
}

export class WsConfigListCmd implements Command {
  name = 'list';
  description = 'EXPERIMENTAL. list config writers';
  alias = '';
  group = 'development';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report() {
    const results = await this.json();
    return formatListOutput(results);
  }

  async json() {
    const cleanResults = await this.workspaceConfigFilesMain.listConfigWriters();
    return cleanResults;
  }
}
