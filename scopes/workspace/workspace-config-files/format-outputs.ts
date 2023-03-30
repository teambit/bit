import Table from 'cli-table';
import chalk from 'chalk';
import { relative } from 'path';
import {
  AspectWritersResults,
  ConfigWritersList,
  EnvsWrittenConfigFile,
  EnvsWrittenConfigFiles,
  EnvsWrittenExtendingConfigFile,
  EnvsWrittenExtendingConfigFiles,
  OneConfigFileWriterResult,
  WriteConfigFilesResult,
} from './workspace-config-files.main.runtime';
import type { CleanConfigCmdFlags, WriteConfigCmdFlags } from './ws-config.cmd';

export function formatListOutput(result: ConfigWritersList): string {
  const head = ['Aspect ID', 'name', 'CLI name'];

  const rows = result.map((entry) => {
    return [entry.aspectId, entry.configWriter.name, entry.configWriter.cliName];
  });
  const table = new Table({ head, style: { head: ['cyan'] } });
  table.push(...rows);
  return table.toString();
}
export function formatWriteOutput(writeConfigFilesResult: WriteConfigFilesResult, flags: WriteConfigCmdFlags): string {
  const { cleanResults, writeResults, wsDir } = writeConfigFilesResult;
  const isDryRun = !!(flags.dryRun || flags.dryRunWithContent);
  const cleanResultsOutput = getCleanResultsOutput(cleanResults, isDryRun);
  const writeResultsOutput = getWriteResultsOutput(writeResults, wsDir, isDryRun);

  return `${cleanResultsOutput}${writeResultsOutput}`;
}

export function formatCleanOutput(cleanResults: string[] = [], flags: CleanConfigCmdFlags): string {
  const isDryRun = !!flags.dryRun;
  const cleanResultsOutput = getCleanResultsOutput(cleanResults, isDryRun);

  return `${cleanResultsOutput}`;
}

function getCleanResultsOutput(cleanResults: string[] | undefined, isDryRun: boolean) {
  const cleanResultsOutput = cleanResults
    ? `${chalk.green(
        `the following ${cleanResults.length} paths ${isDryRun ? 'will be' : 'were'} deleted:`
      )}\n  ${cleanResults.join('\n  ')}\n`
    : '';
  return cleanResultsOutput;
}
function getWriteResultsOutput(writeResults: WriteConfigFilesResult['writeResults'], wsDir: string, isDryRun: boolean) {
  const totalFiles = writeResults.totalWrittenFiles;

  const writeTitle = isDryRun
    ? chalk.green(`${totalFiles} files will be written`)
    : chalk.green(`${totalFiles} files have been written successfully`);
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
