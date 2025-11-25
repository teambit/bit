import chalk from 'chalk';
import { relative } from 'path';
import type {
  OneConfigWriterIdResult,
  WriteConfigFilesResult,
  WriteResults,
} from '../workspace-config-files.main.runtime';
import type { WriteConfigCmdFlags } from '../ws-config.cmd';
import { formatCleanOutput } from './format-clean-output';
import { SUMMARY, WRITE_TITLE } from './write-outputs-texts';
import type {
  EnvsWrittenExtendingConfigFile,
  EnvsWrittenExtendingConfigFiles,
  EnvsWrittenRealConfigFile,
  EnvsWrittenRealConfigFiles,
} from '../writers';

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

function getWriteResultsOutput(writeResults: WriteResults, wsDir: string, isDryRun: boolean) {
  const totalFiles = writeResults.totalWrittenFiles;

  const writeTitle = isDryRun
    ? chalk.green(`${totalFiles} files will be written`)
    : chalk.green(WRITE_TITLE(totalFiles));
  const writeOutput = writeResults.writersResult
    .map((writerResult) => getOneWriterOutput(writerResult, wsDir))
    .join('\n\n');
  return `${writeTitle}\n${writeOutput}`;
}

function getOneWriterOutput(oneWritersResults: OneConfigWriterIdResult, wsDir: string): string {
  const title = chalk.cyan(`  The following paths are according to writer ${chalk.bold(oneWritersResults.writerId)}`);
  const realConfigFilesOutput = getRealConfigFilesOutput(oneWritersResults.realConfigFiles, wsDir);
  const extendingConfigFilesOutput = getExtendingConfigFilesOutput(oneWritersResults.extendingConfigFiles, wsDir);
  return `${title}\n${realConfigFilesOutput}\n\n${extendingConfigFilesOutput}`;
}

function getRealConfigFilesOutput(envsWrittenRealConfigFiles: EnvsWrittenRealConfigFiles, wsDir: string): string {
  const title = chalk.magenta(`  Real config files`);
  const writtenConfigFilesOutput = envsWrittenRealConfigFiles
    .map((envsWrittenConfigFile) => getEnvGroupConfigFilesOutput(envsWrittenConfigFile, wsDir))
    .join('\n\n');
  return `${title}\n${writtenConfigFilesOutput}`;
}
function getEnvGroupConfigFilesOutput(envsWrittenConfigFile: EnvsWrittenRealConfigFile, wsDir: string): string {
  const title = `    The following paths are according to env(s) ${chalk.bold(
    envsWrittenConfigFile.envIds.join(', ')
  )}`;
  const filePath = relative(wsDir, envsWrittenConfigFile.writtenRealConfigFile.filePath);
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
