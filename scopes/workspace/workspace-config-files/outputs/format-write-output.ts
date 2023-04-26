import chalk from 'chalk';
import { relative } from 'path';
import {
  AspectWritersResults,
  EnvsWrittenExtendingConfigFile,
  EnvsWrittenExtendingConfigFiles,
  OneConfigFileWriterResult,
  WriteConfigFilesResult,
} from '../workspace-config-files.main.runtime';
import type { WriteConfigCmdFlags } from '../ws-config.cmd';
import { formatCleanOutput } from './format-clean-output';
import { SUMMARY, WRITE_TITLE } from './write-outputs-texts';

export function formatWriteOutput(writeConfigFilesResult: WriteConfigFilesResult, flags: WriteConfigCmdFlags): string {
  const { cleanResults, writeResults, wsDir } = writeConfigFilesResult;
  const isDryRun = !!(flags.dryRun || flags.dryRunWithContent);
  const cleanResultsOutput = cleanResults?.length ? formatCleanOutput(cleanResults, { dryRun: isDryRun }) : undefined;
  const writeResultsOutput = getWriteResultsOutput(writeResults, wsDir, isDryRun);

  const cleanWriteOutput = cleanResultsOutput ? `${cleanResultsOutput}\n${writeResultsOutput}` : writeResultsOutput;

  return `${cleanWriteOutput}\n\n${SUMMARY}`;
}

function getWriteResultsOutput(writeResults: WriteConfigFilesResult['writeResults'], wsDir: string, isDryRun: boolean) {
  const totalExtendingConfigFiles = writeResults.totalExtendingConfigFiles;

  const writeTitle = isDryRun
    ? chalk.green(`${totalExtendingConfigFiles} files will be written`)
    : chalk.green(WRITE_TITLE(totalExtendingConfigFiles));
  const writeOutput = writeResults.aspectsWritersResults
    .map((aspectWritersResults) => getOneAspectOutput(aspectWritersResults, wsDir))
    .join('\n\n');
  return `${writeTitle}\n${writeOutput}`;
}
function getOneAspectOutput(aspectWritersResults: AspectWritersResults, wsDir: string): string {
  const title = chalk.blue(
    `${aspectWritersResults.totalExtendingConfigFiles} ${chalk.bold(
      aspectWritersResults.aspectId.toString()
    )} configurations added`
  );
  const writersOutput = aspectWritersResults.writersResult
    .map((oneWritersResults) => getOneWriterOutput(oneWritersResults, wsDir))
    .join('\n\n');
  return `${title}\n${writersOutput}`;
}
function getOneWriterOutput(oneWritersResults: OneConfigFileWriterResult, wsDir: string): string {
  const extendingConfigFilesOutput = getExtendingConfigFilesOutput(oneWritersResults.extendingConfigFiles, wsDir);
  return `${extendingConfigFilesOutput}`;
}

function getExtendingConfigFilesOutput(extendingConfigFiles: EnvsWrittenExtendingConfigFiles, wsDir: string): string {
  const extendingConfigFilesOutput = extendingConfigFiles
    .map((envsWrittenExtendingConfigFile) =>
      getEnvGroupExtendingConfigFilesOutput(envsWrittenExtendingConfigFile, wsDir)
    )
    .join('\n');
  return `${extendingConfigFilesOutput}`;
}
function getEnvGroupExtendingConfigFilesOutput(
  envsWrittenExtendingConfigFile: EnvsWrittenExtendingConfigFile,
  wsDir: string
): string {
  const extendingConfigFile = envsWrittenExtendingConfigFile.extendingConfigFile;
  const paths = extendingConfigFile.filePaths.map((p) => `  ${relative(wsDir, p)}`).join('\n');
  return `${paths}`;
}
