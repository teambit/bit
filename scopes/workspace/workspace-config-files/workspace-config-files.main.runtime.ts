import fs from 'fs-extra';
import { join, normalize } from 'path';
import globby from 'globby';
import chalk from 'chalk';
import { PromptCanceled } from '@teambit/legacy.cli.prompts';
import pMapSeries from 'p-map-series';
import { ConsumerNotFound } from '@teambit/legacy.consumer';
import yesno from 'yesno';
import { defaults, flatMap, isFunction, pick, uniq } from 'lodash';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import { Environment, EnvsAspect, ExecutionContext } from '@teambit/envs';
import type { EnvsMain } from '@teambit/envs';
import { Logger, LoggerAspect } from '@teambit/logger';
import type { LoggerMain } from '@teambit/logger';
import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';
import { ConfigWriterEntry } from './config-writer-entry';
import { WsConfigCleanCmd, WsConfigCmd, WsConfigListCmd, WsConfigWriteCmd } from './ws-config.cmd';
import WriteConfigFilesFailed from './exceptions/write-failed';
import { WorkspaceConfigFilesService } from './workspace-config-files.service';
import {
  handleRealConfigFiles,
  handleExtendingConfigFiles,
  EnvsWrittenExtendingConfigFiles,
  EnvsWrittenRealConfigFiles,
} from './writers';

/**
 * Configs that can be configured in the workspace.jsonc file
 */
export type WorkspaceConfigFilesAspectConfig = {
  /**
   * The root directory for real configuration files
   * This is usually under node_modules
   */
  configsRootDir?: string;
  /**
   * The root directory for component files
   * We will hoist config files only up to this directory
   */
  componentsRootDir?: string;
  enableWorkspaceConfigWrite?: boolean;
};

export type EnvConfigWriter = {
  envId: string;
  executionContext: ExecutionContext;
  configWriters: ConfigWriterEntry[];
};

export type EnvConfigWriterEntry = {
  envId: string;
  configWriter: ConfigWriterEntry;
  executionContext: ExecutionContext;
};

type WriterIdsToEnvEntriesMap = {
  [writerId: string]: EnvConfigWriterEntry[];
};

export type EnvConfigWritersList = Array<EnvConfigWriter>;

export type CleanConfigFilesOptions = {
  silent?: boolean; // no prompt
  dryRun?: boolean;
  writers?: string[];
};

export type WriteConfigFilesOptions = {
  clean?: boolean;
  silent?: boolean; // no prompt
  dedupe?: boolean;
  dryRun?: boolean;
  throw?: boolean;
  writers?: string[];
};

export type CompPathExtendingHashMap = { [compPath: string]: string };

export type EnvMapValue = { env: Environment; id: string[]; paths: string[] };
export type EnvCompsDirsMap = { [envId: string]: EnvMapValue };

export type OneConfigWriterIdResult = {
  writerId: string;
  totalWrittenFiles: number;
  realConfigFiles: EnvsWrittenRealConfigFiles;
  totalRealConfigFiles: number;
  extendingConfigFiles: EnvsWrittenExtendingConfigFiles;
  totalExtendingConfigFiles: number;
};

export type WriteResults = {
  writersResult: OneConfigWriterIdResult[];
  totalWrittenFiles: number;
  totalRealConfigFiles: number;
  totalExtendingConfigFiles: number;
};

export type WriteConfigFilesResult = {
  cleanResults?: string[];
  writeResults: WriteResults;
  wsDir: string;
  err?: Error;
};

export class WorkspaceConfigFilesMain {
  private envsNotImplementing = {};

  constructor(
    private workspace: Workspace,
    private envs: EnvsMain,
    private logger: Logger,
    private config: WorkspaceConfigFilesAspectConfig
  ) {}

  /**
   * It writes the configuration files for the workspace
   * for example: tsconfig, eslint config and prettier config files.
   * @param {WriteConfigFilesOptions} options - WriteConfigFilesOptions = {}
   * @returns An object with the following properties:
   * - writeResults: An object with the following properties:
   *   - aspectsWritersResults: An array of objects with the following properties:
   *     - aspect: The aspect that was written
   *     - totalWrittenFiles: The number of files that were written
   *   - totalWrittenFiles: The total number of files that were written
   * - cleanResults: array of deleted paths
   */
  async writeConfigFiles(options: WriteConfigFilesOptions = {}): Promise<WriteConfigFilesResult> {
    if (!this.workspace) {
      throw new ConsumerNotFound();
    }
    const defaultOpts: WriteConfigFilesOptions = {
      clean: false,
      dedupe: false,
      silent: false,
      dryRun: false,
      throw: true,
    };
    const optionsWithDefaults = defaults(options, defaultOpts);
    const execContext = await this.getExecContext();

    let pathsToClean: string[] | undefined = [];
    let writeErr;
    let writeResults;
    try {
      if (optionsWithDefaults.clean) {
        pathsToClean = await this.calcPathsToClean({ writers: optionsWithDefaults.writers });
      }

      writeResults = await this.write(execContext, optionsWithDefaults);
      const allWrittenFiles = writeResults.writersResult.flatMap((writerResult) => {
        return writerResult.extendingConfigFiles.flatMap((extendingConfigFile) => {
          return extendingConfigFile.extendingConfigFile.filePaths;
        });
      });
      // Avoid delete and re-create files that were written by other config writers
      // instead of deleting at the beginning then write all
      // we write all and then delete the files that were not written by the config writers
      // This reduces the config files that re-created (as many times no changes needed)
      // which prevent issues with needing to restart the ts-server in the ide
      pathsToClean = pathsToClean.filter(
        (pathToClean) => !allWrittenFiles.includes(join(this.workspace.path, pathToClean))
      );
      await this.deleteFiles(pathsToClean);
    } catch (err) {
      this.logger.info('writeConfigFiles failed', err);
      if (optionsWithDefaults.throw) {
        throw new WriteConfigFilesFailed();
      }
      writeErr = err;
    }

    return { writeResults, cleanResults: pathsToClean, wsDir: this.workspace.path, err: writeErr };
  }

  /**
   * This will check the config.enableWorkspaceConfigWrite before writing the config files.
   */
  async writeConfigFilesIfEnabled(options: WriteConfigFilesOptions = {}): Promise<WriteConfigFilesResult | undefined> {
    const shouldWrite = this.isWorkspaceConfigWriteEnabled();
    if (!shouldWrite) return undefined;
    return this.writeConfigFiles(options);
  }

  /**
   * It cleans (delete) the config files from the workspace.
   * This will check each file and will only delete it in case it was generated by bit
   * @param {CleanConfigFilesOptions} options - CleanConfigFilesOptions = {}
   * @returns An array of strings.
   */
  async cleanConfigFiles(options: CleanConfigFilesOptions = {}): Promise<string[]> {
    // const execContext = await this.getExecContext();
    if (!this.workspace) {
      throw new ConsumerNotFound();
    }
    const cleanResults = await this.clean(options);
    return cleanResults;
  }

  /**
   * The function checks if the auto writing of workspace configuration is enabled.
   * if it's enabled we will re-generate the configuration files upon bit create
   * @returns the boolean value of `!!this.config.enableWorkspaceConfigWrite`.
   */
  isWorkspaceConfigWriteEnabled() {
    return !!this.config.enableWorkspaceConfigWrite;
  }

  /**
   * It returns a list of all the config writers that have been registered with the config writer slot
   * @returns An array of objects with aspectId and configWriter properties.
   */
  async listConfigWriters(): Promise<EnvConfigWritersList> {
    if (!this.workspace) {
      throw new ConsumerNotFound();
    }
    const execContexts = await this.getExecContext();

    const result: EnvConfigWritersList = execContexts.map((executionContext) => {
      const configWriters = this.getConfigWriters(executionContext);
      return { envId: executionContext.envRuntime.id, executionContext, configWriters };
    });
    return result;
  }

  private groupByWriterId(writerList: EnvConfigWritersList): WriterIdsToEnvEntriesMap {
    return writerList.reduce((acc, envConfigWriter: EnvConfigWriter) => {
      envConfigWriter.configWriters.forEach((configWriter: ConfigWriterEntry) => {
        acc[configWriter.id] = acc[configWriter.id] || [];
        acc[configWriter.id].push({ configWriter, envId: envConfigWriter.envId });
      });
      return acc;
    }, {});
  }

  private async write(envsExecutionContext: ExecutionContext[], opts: WriteConfigFilesOptions): Promise<WriteResults> {
    const envCompDirsMap = this.getEnvComponentsDirsMap(envsExecutionContext);
    const configsRootDir = this.getConfigsRootDir();
    const componentsRootDir = this.getComponentsRootDir();
    const configWriters = await this.listConfigWriters();
    const writerIdsToEnvEntriesMap = this.groupByWriterId(configWriters);
    const filteredWriterIdsToEnvEntriesMap = opts.writers
      ? pick(writerIdsToEnvEntriesMap, opts.writers)
      : writerIdsToEnvEntriesMap;
    let totalRealConfigFiles = 0;
    let totalExtendingConfigFiles = 0;
    const results = await pMapSeries(
      Object.entries(filteredWriterIdsToEnvEntriesMap),
      async ([writerId, envEntries]) => {
        const oneResult = await this.handleOneIdWriter(
          writerId,
          envEntries,
          envCompDirsMap,
          configsRootDir,
          componentsRootDir,
          opts
        );
        totalRealConfigFiles += oneResult.totalRealConfigFiles;
        totalExtendingConfigFiles += oneResult.totalExtendingConfigFiles;
        return oneResult;
      }
    );

    const totalWrittenFiles = totalRealConfigFiles + totalExtendingConfigFiles;
    return { writersResult: results, totalWrittenFiles, totalRealConfigFiles, totalExtendingConfigFiles };
  }

  private async handleOneIdWriter(
    writerId: string,
    envEntries: EnvConfigWriterEntry[],
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    componentsRootDir: string | undefined,
    opts: WriteConfigFilesOptions
  ): Promise<OneConfigWriterIdResult> {
    const writtenRealConfigFilesMap = await handleRealConfigFiles(
      envEntries,
      envCompsDirsMap,
      configsRootDir,
      this.workspace.path,
      opts
    );
    const writtenExtendingConfigFiles = await handleExtendingConfigFiles(
      envEntries,
      envCompsDirsMap,
      writtenRealConfigFilesMap,
      configsRootDir,
      componentsRootDir,
      this.workspace.path,
      opts
    );

    const writtenRealConfigFiles = Object.values(writtenRealConfigFilesMap);
    const totalRealConfigFiles = writtenRealConfigFiles.length;
    const totalExtendingConfigFiles = writtenExtendingConfigFiles.reduce(
      (acc, curr) => acc + curr.extendingConfigFile.filePaths.length,
      0
    );
    const totalWrittenFiles = totalRealConfigFiles + totalExtendingConfigFiles;
    return {
      writerId,
      totalWrittenFiles,
      realConfigFiles: writtenRealConfigFiles,
      totalRealConfigFiles,
      extendingConfigFiles: writtenExtendingConfigFiles,
      totalExtendingConfigFiles,
    };
  }

  private getConfigsRootDir(): string {
    const userConfiguredDir = this.config.configsRootDir;
    return userConfiguredDir ? join(this.workspace.path, userConfiguredDir) : this.getCacheDir(this.workspace.path);
  }

  private getComponentsRootDir(): string | undefined {
    const componentsRootDir = this.config.componentsRootDir;
    if (!componentsRootDir) return undefined;
    // Remove leading './' or '/' and trailing slash
    const normalized = normalize(componentsRootDir)
      .replace(/^\.?\//, '')
      .replace(/\/$/, '');
    return normalized;
  }

  private getCacheDir(rootDir): string {
    return join(rootDir, 'node_modules', '.cache');
  }

  private async getExecContext(): Promise<ExecutionContext[]> {
    const components = await this.workspace.list();
    const runtime = await this.envs.createEnvironment(components);
    const execContext = runtime.getEnvExecutionContext();
    return execContext;
  }

  private getEnvComponentsDirsMap(envsExecutionContext: ExecutionContext[]): EnvCompsDirsMap {
    const envCompDirsMap = envsExecutionContext.reduce((acc, envExecution) => {
      const envRuntime = envExecution.envRuntime;
      const envId = envRuntime.id.toString();
      const value = {
        id: envRuntime.id,
        env: envRuntime.env,
        paths: envRuntime.components.map((c) => this.workspace.componentDir(c.id, undefined, { relative: true })),
      };
      acc[envId] = value;
      return acc;
    }, {});
    return envCompDirsMap;
  }

  private getConfigWriters(envExecutionContext: ExecutionContext): ConfigWriterEntry[] {
    if (envExecutionContext.env.workspaceConfig && isFunction(envExecutionContext.env.workspaceConfig)) {
      return envExecutionContext.env.workspaceConfig();
    }
    this.addToEnvsNotImplementing(envExecutionContext.env.id);
    return [];
  }

  private getFlatConfigWriters(envsExecutionContext: ExecutionContext[]): ConfigWriterEntry[] {
    return flatMap(envsExecutionContext, (envExecutionContext) => {
      return this.getConfigWriters(envExecutionContext);
    });
  }

  /**
   * Clean config files written by the config-writers
   * @param envsExecutionContext
   * @param param1
   * @returns Array of paths of deleted config files
   */
  async clean({ dryRun, silent, writers }: WriteConfigFilesOptions): Promise<string[]> {
    const paths = await this.calcPathsToClean({ writers });
    if (dryRun) return paths;
    if (!silent) await this.promptForCleaning(paths);
    await this.deleteFiles(paths);
    return paths;
  }

  private async calcPathsToClean({ writers }: WriteConfigFilesOptions): Promise<string[]> {
    const execContext = await this.getExecContext();
    const configWriters = this.getFlatConfigWriters(execContext);
    const filteredConfigWriters = writers
      ? configWriters.filter((configWriter) => writers.includes(configWriter.id))
      : configWriters;

    const paths = uniq(
      filteredConfigWriters
        .map((configWriter) => {
          const patterns = configWriter.patterns;
          const currPaths = globby.sync(patterns, {
            cwd: this.workspace.path,
            dot: true,
            onlyFiles: true,
            ignore: ['**/node_modules/**'],
          });
          const filteredPaths = currPaths.filter((path) => {
            const fullPath = join(this.workspace.path, path);
            return configWriter.isBitGenerated ? configWriter.isBitGenerated(fullPath) : true;
          });
          return filteredPaths;
        })
        .flat()
    );
    return paths;
  }

  private addToEnvsNotImplementing(envId: string) {
    this.envsNotImplementing[envId] = true;
  }

  getEnvsNotImplementing() {
    return Object.keys(this.envsNotImplementing);
  }

  private async promptForCleaning(paths: string[]) {
    this.logger.clearStatusLine();
    const ok = await yesno({
      question: `${chalk.underline('The following files will be deleted:')}
${paths.join('\n')}
${chalk.bold('Do you want to continue? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new PromptCanceled();
    }
  }

  private async deleteFiles(paths: string[]) {
    await Promise.all(paths.map((f) => fs.remove(join(this.workspace.path, f))));
  }

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect];

  static runtime = MainRuntime;

  static defaultConfig: Partial<WorkspaceConfigFilesAspectConfig> = {
    enableWorkspaceConfigWrite: false,
  };

  static async provider(
    [cli, workspace, envs, loggerAspect]: [CLIMain, Workspace, EnvsMain, LoggerMain],
    config: WorkspaceConfigFilesAspectConfig
  ) {
    const logger = loggerAspect.createLogger(WorkspaceConfigFilesAspect.id);
    envs.registerService(new WorkspaceConfigFilesService(logger));

    const workspaceConfigFilesMain = new WorkspaceConfigFilesMain(workspace, envs, logger, config);
    const wsConfigCmd = new WsConfigCmd();
    wsConfigCmd.commands = [
      new WsConfigWriteCmd(workspaceConfigFilesMain),
      new WsConfigCleanCmd(workspaceConfigFilesMain),
      new WsConfigListCmd(workspaceConfigFilesMain),
    ];
    cli.register(wsConfigCmd);
    return workspaceConfigFilesMain;
  }
}

WorkspaceConfigFilesAspect.addRuntime(WorkspaceConfigFilesMain);

export default WorkspaceConfigFilesMain;
