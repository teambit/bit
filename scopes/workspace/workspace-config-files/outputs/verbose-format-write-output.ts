import chalk from 'chalk';
import { relative } from 'path';
import {
  AspectWritersResults,
  EnvsWrittenConfigFile,
  EnvsWrittenConfigFiles,
  EnvsWrittenExtendingConfigFile,
  EnvsWrittenExtendingConfigFiles,
  OneConfigFileWriterResult,
  WriteConfigFilesResult,
} from '../workspace-config-files.main.runtime';
import type { WriteConfigCmdFlags } from '../ws-config.cmd';
import { formatCleanOutput } from './format-clean-output';
import { SUMMARY, WRITE_TITLE } from './write-outputs-texts';

export function verboseFormatWriteOutput(
  writeConfigFilesResult: WriteConfigFilesResult,
  flags: WriteConfigCmdFlags
): string {
  const { cleanResults, writeResults, wsDir } = writeConfigFilesResult;
  const isDryRun = !!(flags.dryRun || flags.dryRunWithContent);
  const cleanResultsOutput = formatCleanOutput(cleanResults, { dryRun: isDryRun });
  const writeResultsOutput = getWriteResultsOutput(writeResults, wsDir, isDryRun);

  return `${cleanResultsOutput}\n${writeResultsOutput}\n\n${SUMMARY}`;
}

function getWriteResultsOutput(writeResults: WriteConfigFilesResult['writeResults'], wsDir: string, isDryRun: boolean) {
  const totalFiles = writeResults.totalWrittenFiles;

  const writeTitle = isDryRun
    ? chalk.green(`${totalFiles} files will be written`)
    : chalk.green(WRITE_TITLE(totalFiles));
  const writeOutput = writeResults.aspectsWritersResults
    .map((aspectWritersResults) => getOneAspectOutput(aspectWritersResults, wsDir))
    .join('\n\n');
  return `${writeTitle}\n${writeOutput}`;
}
function getOneAspectOutput(aspectWritersResults: AspectWritersResults, wsDir: string): string {
  const title = chalk.blue(
    `The following paths are according to aspect ${chalk.bold(aspectWritersResults.aspectId.toString())}`
  );
  const writersOutput = aspectWritersResults.writersResult
    .map((oneWritersResults) => getOneWriterOutput(oneWritersResults, wsDir))
    .join('\n\n');
  return `${title}\n${writersOutput}`;
}
function getOneWriterOutput(oneWritersResults: OneConfigFileWriterResult, wsDir: string): string {
  const title = chalk.cyan(`  The following paths are according to writer ${chalk.bold(oneWritersResults.name)}`);
  const realConfigFilesOutput = getRealConfigFilesOutput(oneWritersResults.configFiles, wsDir);
  const extendingConfigFilesOutput = getExtendingConfigFilesOutput(oneWritersResults.extendingConfigFiles, wsDir);
  return `${title}\n${realConfigFilesOutput}\n\n${extendingConfigFilesOutput}`;
}

function getRealConfigFilesOutput(envsWrittenConfigFiles: EnvsWrittenConfigFiles, wsDir: string): string {
  const title = chalk.magenta(`  Real config files`);
  const writtenConfigFilesOutput = envsWrittenConfigFiles
    .map((envsWrittenConfigFile) => getEnvGroupConfigFilesOutput(envsWrittenConfigFile, wsDir))
    .join('\n\n');
  return `${title}\n${writtenConfigFilesOutput}`;
}
function getEnvGroupConfigFilesOutput(envsWrittenConfigFile: EnvsWrittenConfigFile, wsDir: string): string {
  const title = `    The following paths are according to env(s) ${chalk.bold(
    envsWrittenConfigFile.envIds.join(', ')
  )}`;
  const filePath = relative(wsDir, envsWrittenConfigFile.configFile.filePath);
  return `${title}\n      ${filePath}`;
}
function getExtendingConfigFilesOutput(extendingConfigFiles: EnvsWrittenExtendingConfigFiles, wsDir: string): string {
  const title = chalk.magenta(`  Extending config files`);

  const extendingConfigFilesOutput = extendingConfigFiles
    .map((envsWrittenExtendingConfigFile) =>
      getEnvGroupExtendingConfigFilesOutput(envsWrittenExtendingConfigFile, wsDir)
    )
    .join('\n\n');
  return `${title}\n${extendingConfigFilesOutput}`;
}
function getEnvGroupExtendingConfigFilesOutput(
  envsWrittenExtendingConfigFile: EnvsWrittenExtendingConfigFile,
  wsDir: string
): string {
  const title = `    The following paths are according to env(s) ${chalk.bold(
    envsWrittenExtendingConfigFile.envIds.join(', ')
  )}`;
  const extendingConfigFile = envsWrittenExtendingConfigFile.extendingConfigFile;
  const paths = extendingConfigFile.filePaths
    .map((p) => `  ${relative(wsDir, p)} --> ${relative(wsDir, extendingConfigFile.extendingTarget.filePath)}`)
    .join('\n    ');
  return `${title}\n    ${paths}`;
}
