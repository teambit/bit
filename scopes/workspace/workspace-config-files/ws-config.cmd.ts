/* eslint-disable max-classes-per-file */

import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { WorkspaceConfigFilesMain, WriteConfigFilesResult } from './workspace-config-files.main.runtime';
import { formatCleanOutput, formatListOutput, formatWriteOutput, verboseFormatWriteOutput } from './outputs';

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
  verbose?: boolean;
};

const COMMAND_NAME = 'ws-config';

export class WsConfigCmd implements Command {
  name = `${COMMAND_NAME} <sub-command>`;
  alias = 'workspace-config';
  description = 'generate IDE configuration files';
  extendedDescription = `writes configuration files (tsconfig.json, eslintrc.js, etc.) to your workspace for better IDE support.
automatically generates configs based on your components' environments and settings.
useful for enabling proper IntelliSense, linting, and type-checking in your IDE.`;
  options = [];
  group = 'workspace-tools';
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
  description = 'write config files in the workspace. useful for IDEs';
  alias = '';
  group = 'workspace-tools';
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
      'use with --json flag. show the config content and the paths that will be written per env',
    ],
    ['v', 'verbose', 'showing verbose output for writing'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report(_args, flags: WriteConfigCmdFlags) {
    const results = (await this.json(_args, flags)) as WriteConfigFilesResult;
    if (flags.dryRunWithContent) {
      throw new Error(`use --json flag along with --dry-run-with-content`);
    }
    const envsNotImplementing = this.workspaceConfigFilesMain.getEnvsNotImplementing();
    const warning = getWarningForNonImplementingEnvs(envsNotImplementing);
    const output = flags.verbose ? verboseFormatWriteOutput(results, flags) : formatWriteOutput(results, flags);
    return warning + output;
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
      const updatedWriteResults = writeResults;
      if (!dryRunWithContent) {
        updatedWriteResults.writersResult = updatedWriteResults.writersResult.map((oneWriterResult) => {
          oneWriterResult.realConfigFiles.forEach((realConfigFile) => {
            realConfigFile.writtenRealConfigFile.content = '';
          });
          oneWriterResult.extendingConfigFiles.forEach((extendingConfigFile) => {
            extendingConfigFile.extendingConfigFile.content = '';
          });
          return oneWriterResult;
        });
      }

      return {
        wsDir,
        cleanResults,
        writeResults: updatedWriteResults,
      };
    }
    return { wsDir, cleanResults, writeResults };
  }
}

export class WsConfigCleanCmd implements Command {
  name = 'clean';
  description = 'clean (delete) written config files in the workspace. useful for IDEs';
  alias = '';
  group = 'workspace-tools';
  options = [
    ['s', 'silent', 'do not prompt for confirmation'],
    [
      'w',
      'writers <writers>',
      `only clean config files for the given writers. use comma to separate multiple writers. use ${COMMAND_NAME} list to see all writers`,
    ],
    ['', 'dry-run', 'show the paths of configs that will be cleaned'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report(_args, flags: CleanConfigCmdFlags) {
    const results = await this.json(_args, flags);
    const envsNotImplementing = this.workspaceConfigFilesMain.getEnvsNotImplementing();
    const warning = getWarningForNonImplementingEnvs(envsNotImplementing);
    const output = formatCleanOutput(results, flags);
    return warning + output;
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
  description = 'list config writers';
  alias = '';
  group = 'workspace-tools';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private workspaceConfigFilesMain: WorkspaceConfigFilesMain) {}

  async report() {
    const results = await this.json();
    const envsNotImplementing = this.workspaceConfigFilesMain.getEnvsNotImplementing();
    const warning = getWarningForNonImplementingEnvs(envsNotImplementing);
    const output = formatListOutput(results);
    return warning + output;
  }

  async json() {
    const cleanResults = await this.workspaceConfigFilesMain.listConfigWriters();
    return cleanResults;
  }
}

function getWarningForNonImplementingEnvs(envsNotImplementing: string[]) {
  if (!envsNotImplementing.length) return '';
  const message =
    chalk.yellow(`Bit cannot determine the correct contents for the config files to write. this may result in incorrect content.
The following environments need to add support for config files: ${chalk.cyan(envsNotImplementing.join(', '))}.
Read here how to correct and improve dev-ex - LINK

`);
  return message;
}
