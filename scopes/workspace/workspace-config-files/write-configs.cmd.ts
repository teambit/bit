import { omit } from 'lodash';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import {
  AspectWritersResults,
  EnvsWrittenConfigFile,
  EnvsWrittenConfigFiles,
  EnvsWrittenExtendingConfigFile,
  EnvsWrittenExtendingConfigFiles,
  OneConfigFileWriterResult,
  WorkspaceConfigFilesMain,
  WriteConfigFilesResult,
} from './workspace-config-files.main.runtime';

type Flags = { dryRun?: boolean; noDedupe?: boolean; dryRunWithContent?: boolean; clean?: boolean; silent?: boolean };

export default class WriteConfigsCmd implements Command {
  name = 'write-configs';
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
    const results = await this.json(_args, flags) as WriteConfigFilesResult;
    if (flags.dryRunWithContent) {
      throw new Error(`use --json flag along with --dry-run-with-content`);
    }
    return this.formatOutput(results, flags);
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

  private formatOutput(writeConfigFilesResult: WriteConfigFilesResult, flags: Flags): string {
    const { cleanResults, writeResults } = writeConfigFilesResult;
    const isDryRun = !!(flags.dryRun || flags.dryRunWithContent);
    const cleanResultsOutput = this.getCleanResultsOutput(cleanResults, isDryRun);
    const writeResultsOutput = this.getWriteResultsOutput(writeResults, isDryRun);

    return `${cleanResultsOutput}${writeResultsOutput}`;
  }

  private getCleanResultsOutput(cleanResults: string[] | undefined, isDryRun: boolean) {
    const cleanResultsOutput = cleanResults
      ? `${chalk.green(
          `the following ${cleanResults.length} paths ${isDryRun ? 'will be' : 'were'} deleted`
        )}\n${cleanResults.join('\n')}\n\n`
      : '';
    return cleanResultsOutput;
  }
  private getWriteResultsOutput(writeResults: WriteConfigFilesResult['writeResults'], isDryRun: boolean) {
    const totalFiles = writeResults.totalWrittenFiles;

    const writeTitle = isDryRun
      ? chalk.green(`${totalFiles} files will be written`)
      : chalk.green(`${totalFiles} files have been written successfully`);
    const writeOutput = writeResults.aspectsWritersResults
      .map((aspectWritersResults) => this.getOneAspectOutput(aspectWritersResults))
      .join('\n\n');
    return `${writeTitle}\n${writeOutput}`;
  }
  private getOneAspectOutput(aspectWritersResults: AspectWritersResults): string {
    const title = `The following paths are according to aspect ${chalk.bold(aspectWritersResults.aspectId.toString())}`;
    const writersOutput = aspectWritersResults.writersResult
      .map((oneWritersResults) => this.getOneWriterOutput(oneWritersResults))
      .join('\n\n');
    return `${title}\n${writersOutput}`;
  }
  private getOneWriterOutput(oneWritersResults: OneConfigFileWriterResult): string {
    const title = `The following paths are according to writer ${chalk.bold(oneWritersResults.name)}`;
    const realConfigFilesOutput = this.getRealConfigFilesOutput(oneWritersResults.configFiles);
    const extendingConfigFilesOutput = this.getExtendingConfigFilesOutput(oneWritersResults.extendingConfigFiles);
    return `${title}\n${realConfigFilesOutput}\n${extendingConfigFilesOutput}`;
  }

  private getRealConfigFilesOutput(envsWrittenConfigFiles: EnvsWrittenConfigFiles): string {
    return envsWrittenConfigFiles
      .map((envsWrittenConfigFile) => this.getEnvGroupConfigFilesOutput(envsWrittenConfigFile))
      .join('\n\n');
  }
  private getEnvGroupConfigFilesOutput(envsWrittenConfigFile: EnvsWrittenConfigFile): string {
    const title = `The following paths are according to env(s) ${chalk.bold(envsWrittenConfigFile.envIds.join(', '))}`;
    const filePath = envsWrittenConfigFile.configFile.filePath;
    return `${title}\n${filePath}`;
  }
  private getExtendingConfigFilesOutput(extendingConfigFiles: EnvsWrittenExtendingConfigFiles): string {
    return extendingConfigFiles
      .map((envsWrittenExtendingConfigFile) =>
        this.getEnvGroupExtendingConfigFilesOutput(envsWrittenExtendingConfigFile)
      )
      .join('\n\n');
  }
  private getEnvGroupExtendingConfigFilesOutput(
    envsWrittenExtendingConfigFile: EnvsWrittenExtendingConfigFile
  ): string {
    const title = `The following paths are according to env(s) ${chalk.bold(
      envsWrittenExtendingConfigFile.envIds.join(', ')
    )}`;
    const extendingConfigFile = envsWrittenExtendingConfigFile.extendingConfigFile;
    const paths = extendingConfigFile.filePaths.map((p) => `  ${p} --> ${extendingConfigFile.extendingTarget}`).join('\n');
    return `${title}\n${paths}`;
  }
}
