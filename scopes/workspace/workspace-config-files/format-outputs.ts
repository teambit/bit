import chalk from "chalk";
import { AspectWritersResults, EnvsWrittenConfigFile, EnvsWrittenConfigFiles, EnvsWrittenExtendingConfigFile, EnvsWrittenExtendingConfigFiles, OneConfigFileWriterResult, WriteConfigFilesResult } from "./workspace-config-files.main.runtime";
import { Flags } from "./ws-config.cmd";

export function formatWriteOutput(writeConfigFilesResult: WriteConfigFilesResult, flags: Flags): string {
  const { cleanResults, writeResults } = writeConfigFilesResult;
  const isDryRun = !!(flags.dryRun || flags.dryRunWithContent);
  const cleanResultsOutput = getCleanResultsOutput(cleanResults, isDryRun);
  const writeResultsOutput = getWriteResultsOutput(writeResults, isDryRun);

  return `${cleanResultsOutput}${writeResultsOutput}`;
}

function getCleanResultsOutput(cleanResults: string[] | undefined, isDryRun: boolean) {
  const cleanResultsOutput = cleanResults
    ? `${chalk.green(
        `the following ${cleanResults.length} paths ${isDryRun ? 'will be' : 'were'} deleted`
      )}\n${cleanResults.join('\n')}\n\n`
    : '';
  return cleanResultsOutput;
}
function getWriteResultsOutput(writeResults: WriteConfigFilesResult['writeResults'], isDryRun: boolean) {
  const totalFiles = writeResults.totalWrittenFiles;

  const writeTitle = isDryRun
    ? chalk.green(`${totalFiles} files will be written`)
    : chalk.green(`${totalFiles} files have been written successfully`);
  const writeOutput = writeResults.aspectsWritersResults
    .map((aspectWritersResults) => getOneAspectOutput(aspectWritersResults))
    .join('\n\n');
  return `${writeTitle}\n${writeOutput}`;
}
function getOneAspectOutput(aspectWritersResults: AspectWritersResults): string {
  const title = `The following paths are according to aspect ${chalk.bold(aspectWritersResults.aspectId.toString())}`;
  const writersOutput = aspectWritersResults.writersResult
    .map((oneWritersResults) => getOneWriterOutput(oneWritersResults))
    .join('\n\n');
  return `${title}\n${writersOutput}`;
}
function getOneWriterOutput(oneWritersResults: OneConfigFileWriterResult): string {
  const title = `The following paths are according to writer ${chalk.bold(oneWritersResults.name)}`;
  const realConfigFilesOutput = getRealConfigFilesOutput(oneWritersResults.configFiles);
  const extendingConfigFilesOutput = getExtendingConfigFilesOutput(oneWritersResults.extendingConfigFiles);
  return `${title}\n${realConfigFilesOutput}\n${extendingConfigFilesOutput}`;
}

function getRealConfigFilesOutput(envsWrittenConfigFiles: EnvsWrittenConfigFiles): string {
  return envsWrittenConfigFiles
    .map((envsWrittenConfigFile) => getEnvGroupConfigFilesOutput(envsWrittenConfigFile))
    .join('\n\n');
}
function getEnvGroupConfigFilesOutput(envsWrittenConfigFile: EnvsWrittenConfigFile): string {
  const title = `The following paths are according to env(s) ${chalk.bold(envsWrittenConfigFile.envIds.join(', '))}`;
  const filePath = envsWrittenConfigFile.configFile.filePath;
  return `${title}\n${filePath}`;
}
function getExtendingConfigFilesOutput(extendingConfigFiles: EnvsWrittenExtendingConfigFiles): string {
  return extendingConfigFiles
    .map((envsWrittenExtendingConfigFile) =>
      getEnvGroupExtendingConfigFilesOutput(envsWrittenExtendingConfigFile)
    )
    .join('\n\n');
}
function getEnvGroupExtendingConfigFilesOutput(
  envsWrittenExtendingConfigFile: EnvsWrittenExtendingConfigFile
): string {
  const title = `The following paths are according to env(s) ${chalk.bold(
    envsWrittenExtendingConfigFile.envIds.join(', ')
  )}`;
  const extendingConfigFile = envsWrittenExtendingConfigFile.extendingConfigFile;
  const paths = extendingConfigFile.filePaths.map((p) => `  ${p} --> ${extendingConfigFile.extendingTarget}`).join('\n');
  return `${title}\n${paths}`;
}
