import format from 'string-format';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { dirname, join, relative } from 'path';
import globby from 'globby';
import chalk from 'chalk';
import { PromptCanceled } from '@teambit/legacy/dist/prompts/exceptions';
import pMapSeries from 'p-map-series';
import yesno from 'yesno';
import { compact } from 'lodash';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import { Environment, EnvsAspect, ExecutionContext } from '@teambit/envs';
import type { EnvsMain } from '@teambit/envs';
import { Logger, LoggerAspect } from '@teambit/logger';
import type { LoggerMain } from '@teambit/logger';
import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';
import { ConfigFile, ConfigWriterEntry, ExtendingConfigFile } from './config-writer-entry';
import { WsConfigCleanCmd, WsConfigCmd, WsConfigListCmd, WsConfigWriteCmd } from './ws-config.cmd';
import { DedupedPaths, dedupePaths } from './dedup-paths';
import WriteConfigFilesFailed from './exceptions/write-failed';

export type ConfigWriterSlot = SlotRegistry<ConfigWriterEntry[]>;

export type ConfigWritersList = Array<{
  aspectId: string;
  configWriter: ConfigWriterEntry;
}>;

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
  writers?: string[];
};

export type WrittenConfigFile = Required<ConfigFile> & {
  filePath: string;
};

export type WrittenExtendingConfigFile = ExtendingConfigFile & {
  filePaths: string[];
};

export type WrittenConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    configFile: WrittenConfigFile;
  };
};

export type ExtendingConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    extendingConfigFile: Required<ExtendingConfigFile>;
  };
};

export type CompPathExtendingHashMap = { [compPath: string]: string };

export type EnvMapValue = { env: Environment; id: string[]; paths: string[] };
export type EnvCompsDirsMap = { [envId: string]: EnvMapValue };

export type EnvsWrittenConfigFile = { envIds: string[]; configFile: WrittenConfigFile };
export type EnvsWrittenConfigFiles = Array<EnvsWrittenConfigFile>;

export type EnvsWrittenExtendingConfigFile = { envIds: string[]; extendingConfigFile: WrittenExtendingConfigFile };
export type EnvsWrittenExtendingConfigFiles = Array<EnvsWrittenExtendingConfigFile>;

export type OneConfigFileWriterResult = {
  name: string;
  totalWrittenFiles: number;
  configFiles: EnvsWrittenConfigFiles;
  totalConfigFiles: number;
  extendingConfigFiles: EnvsWrittenExtendingConfigFiles;
  totalExtendingConfigFiles: number;
};

export type AspectWritersResults = {
  aspectId: string;
  writersResult: OneConfigFileWriterResult[];
  totalWrittenFiles: number;
};

export type WriteConfigFilesResult = {
  cleanResults?: string[];
  writeResults: { totalWrittenFiles: number; aspectsWritersResults: AspectWritersResults[] };
  wsDir: string;
};

export class WorkspaceConfigFilesMain {
  constructor(
    readonly configWriterSlot: ConfigWriterSlot,
    private workspace: Workspace,
    private envs: EnvsMain,
    private logger: Logger
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
    const execContext = await this.getExecContext();

    let cleanResults: string[] | undefined;
    if (options.clean) {
      cleanResults = await this.clean(options);
    }

    let aspectsWritersResults;
    try {
      aspectsWritersResults = await this.write(execContext, options);
    } catch (err) {
      this.logger.info('writeConfigFiles failed', err);
      throw new WriteConfigFilesFailed();
    }
    const totalWrittenFiles = aspectsWritersResults.reduce((acc, curr) => {
      return acc + curr.totalWrittenFiles;
    }, 0);
    const writeResults = { aspectsWritersResults, totalWrittenFiles };

    return { writeResults, cleanResults, wsDir: this.workspace.path };
  }

  /**
   * It cleans (delete) the config files from the workspace.
   * This will check each file and will only delete it in case it was generated by bit
   * @param {CleanConfigFilesOptions} options - CleanConfigFilesOptions = {}
   * @returns An array of strings.
   */
  async cleanConfigFiles(options: CleanConfigFilesOptions = {}): Promise<string[]> {
    // const execContext = await this.getExecContext();
    const cleanResults = await this.clean(options);
    return cleanResults;
  }

  /**
   * It returns a list of all the config writers that have been registered with the config writer slot
   * @returns An array of objects with aspectId and configWriter properties.
   */
  listConfigWriters(): ConfigWritersList {
    const slotEntries = this.configWriterSlot.toArray();
    const result: ConfigWritersList = slotEntries.reduce((acc, [aspectId, configWriters]) => {
      const curr = configWriters.map((configWriter) => ({ aspectId, configWriter }));
      return acc.concat(curr);
    }, [] as ConfigWritersList);
    return result;
  }

  private async write(
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<AspectWritersResults[]> {
    const envCompDirsMap = this.getEnvComponentsDirsMap(envsExecutionContext);
    const slotEntries = this.configWriterSlot.toArray();
    const configsRootDir = this.getConfigsRootDir();
    const results = await pMapSeries(slotEntries, async (aspectEntry) => {
      const [aspectId, configWriters] = aspectEntry;
      return this.handleOneAspectWriter(
        aspectId,
        configWriters,
        envCompDirsMap,
        configsRootDir,
        envsExecutionContext,
        opts
      );
    });
    return results;
  }

  private async handleOneAspectWriter(
    aspectId: string,
    configWriters: ConfigWriterEntry[],
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<AspectWritersResults> {
    const results = await pMapSeries(configWriters, async (configWriter) => {
      if (opts.writers && !(opts.writers.includes(configWriter.name) || opts.writers.includes(configWriter.cliName)))
        return undefined;
      return this.handleOneConfigFileWriter(configWriter, envCompsDirsMap, configsRootDir, envsExecutionContext, opts);
    });
    const compactResults = compact(results);
    const totalWrittenFiles = compactResults.reduce((acc, curr) => {
      return acc + curr.totalWrittenFiles;
    }, 0);
    return { aspectId, writersResult: compactResults, totalWrittenFiles };
  }

  private async handleOneConfigFileWriter(
    configWriter: ConfigWriterEntry,
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<OneConfigFileWriterResult> {
    const writtenConfigFilesMap: WrittenConfigFilesMap = {};
    const extendingConfigFilesMap: ExtendingConfigFilesMap = {};
    await pMapSeries(Object.entries(envCompsDirsMap), async ([envId, envMapValue]) => {
      const executionContext = envsExecutionContext.find((context) => context.id === envId);
      if (!executionContext) throw new Error(`failed finding execution context for env ${envId}`);
      const writtenConfigFiles = await this.handleRealConfigFiles(
        envId,
        envMapValue,
        executionContext,
        configWriter,
        configsRootDir,
        writtenConfigFilesMap,
        opts
      );
      if (writtenConfigFiles) {
        this.buildExtendingConfigFilesMap(
          configWriter,
          writtenConfigFiles,
          envId,
          extendingConfigFilesMap,
          envCompsDirsMap,
          configsRootDir,
          opts
        );
      }
    });
    if (!writtenConfigFilesMap || Object.keys(writtenConfigFilesMap).length === 0) {
      return {
        name: configWriter.name,
        configFiles: [],
        totalConfigFiles: 0,
        totalWrittenFiles: 0,
        extendingConfigFiles: [],
        totalExtendingConfigFiles: 0,
      };
    }

    const fileHashPerDedupedPaths = dedupePaths(extendingConfigFilesMap, envCompsDirsMap);
    const extendingConfigFiles = await this.writeExtendingConfigFiles(
      extendingConfigFilesMap,
      fileHashPerDedupedPaths,
      opts
    );
    if (configWriter.postProcessExtendingConfigFiles) {
      await configWriter.postProcessExtendingConfigFiles({
        workspaceDir: this.workspace.path,
        configsRootDir,
        writtenExtendingConfigFiles: extendingConfigFiles,
        envCompsDirsMap,
        dryRun: !!opts.dryRun,
      });
    }
    const totalExtendingConfigFiles = extendingConfigFiles.reduce(
      (acc, curr) => acc + curr.extendingConfigFile.filePaths.length,
      0
    );
    const configFiles = Object.values(writtenConfigFilesMap);
    const totalConfigFiles = Object.keys(writtenConfigFilesMap).length;
    const totalWrittenFiles = totalConfigFiles + totalExtendingConfigFiles;
    const result: OneConfigFileWriterResult = {
      name: configWriter.name,
      configFiles,
      totalWrittenFiles,
      totalConfigFiles: Object.keys(writtenConfigFilesMap).length,
      extendingConfigFiles,
      totalExtendingConfigFiles,
    };
    return result;
  }

  private async handleRealConfigFiles(
    envId: string,
    envMapValue: EnvMapValue,
    executionContext: ExecutionContext,
    configWriter: ConfigWriterEntry,
    configsRootDir: string,
    writtenConfigFilesMap: WrittenConfigFilesMap,
    opts: WriteConfigFilesOptions
  ): Promise<WrittenConfigFile[] | undefined> {
    const calculatedConfigFiles = configWriter.calcConfigFiles(executionContext, envMapValue.env, configsRootDir);
    if (!calculatedConfigFiles) return undefined;
    const writtenConfigFiles = await Promise.all(
      calculatedConfigFiles.map(async (configFile) => {
        const writtenConfigFile = await this.writeConfigFile(configFile, configsRootDir, opts);
        if (!writtenConfigFilesMap[writtenConfigFile.hash]) {
          writtenConfigFilesMap[writtenConfigFile.hash] = { configFile: writtenConfigFile, envIds: [] };
        }
        writtenConfigFilesMap[writtenConfigFile.hash].envIds.push(envId);
        return writtenConfigFile;
      })
    );
    if (configWriter.postProcessConfigFiles) {
      await configWriter.postProcessConfigFiles(writtenConfigFiles, executionContext, envMapValue, {
        dryRun: !!opts.dryRun,
      });
    }
    return writtenConfigFiles;
  }

  private async writeConfigFile(
    configFile: ConfigFile,
    configsRootDir: string,
    opts: WriteConfigFilesOptions
  ): Promise<WrittenConfigFile> {
    const hash = configFile.hash || sha1(configFile.content);
    const name = format(configFile.name, { hash });
    const filePath = join(configsRootDir, name);
    if (!opts.dryRun) {
      // const exists = await fs.pathExists(filePath);
      // if (!exists) {
      await fs.outputFile(filePath, configFile.content);
      // }
    }
    const res = {
      name,
      hash,
      filePath,
      content: configFile.content,
    };
    return res;
  }

  private async writeExtendingConfigFiles(
    extendingConfigFilesMap: ExtendingConfigFilesMap,
    fileHashPerDedupedPaths: DedupedPaths,
    opts: WriteConfigFilesOptions
  ): Promise<EnvsWrittenExtendingConfigFiles> {
    const finalResult: EnvsWrittenExtendingConfigFiles = await Promise.all(
      fileHashPerDedupedPaths.map(async ({ fileHash, paths }) => {
        const envsConfigFile = extendingConfigFilesMap[fileHash];
        const configFile = envsConfigFile.extendingConfigFile;
        const hash = configFile.hash || sha1(configFile.content);
        const name = format(configFile.name, { hash });
        const writtenPaths = await Promise.all(
          paths.map(async (path) => {
            const filePath = join(this.workspace.path, path, name);
            const targetPath = configFile.useAbsPaths
              ? configFile.extendingTarget.filePath
              : `./${relative(dirname(filePath), configFile.extendingTarget.filePath)}`;
            const content = configFile.content.replace(`{${configFile.extendingTarget.name}}`, targetPath);
            if (!opts.dryRun) {
              await fs.outputFile(filePath, content);
            }
            return filePath;
          })
        );
        const res: EnvsWrittenExtendingConfigFile = {
          envIds: envsConfigFile.envIds,
          extendingConfigFile: {
            name,
            hash,
            content: configFile.content,
            extendingTarget: configFile.extendingTarget,
            filePaths: writtenPaths,
          },
        };
        return res;
      })
    );
    return finalResult;
  }

  private buildExtendingConfigFilesMap(
    configWriter: ConfigWriterEntry,
    writtenConfigFiles: WrittenConfigFile[],
    envId: string,
    extendingConfigFilesMap: ExtendingConfigFilesMap,
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    opts: WriteConfigFilesOptions
  ) {
    const extendingConfigFile = this.generateExtendingFile(
      configWriter,
      writtenConfigFiles,
      envCompsDirsMap,
      configsRootDir,
      opts
    );
    if (!extendingConfigFile) return;
    if (!extendingConfigFilesMap[extendingConfigFile.hash]) {
      extendingConfigFilesMap[extendingConfigFile.hash] = { extendingConfigFile, envIds: [] };
    }
    extendingConfigFilesMap[extendingConfigFile.hash].envIds.push(envId);
  }

  private generateExtendingFile(
    configWriter: ConfigWriterEntry,
    writtenConfigFiles,
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    opts: WriteConfigFilesOptions
  ): Required<ExtendingConfigFile> | undefined {
    const args = {
      workspaceDir: this.workspace.path,
      configsRootDir,
      writtenConfigFiles,
      envCompsDirsMap,
      dryRun: !!opts.dryRun,
    };
    const extendingConfigFile = configWriter.generateExtendingFile(args);
    if (!extendingConfigFile) return undefined;
    const hash = extendingConfigFile.hash || sha1(extendingConfigFile.content);
    return {
      ...extendingConfigFile,
      useAbsPaths: !!extendingConfigFile.useAbsPaths,
      hash,
    };
  }

  private getConfigsRootDir() {
    return this.getCacheDir(this.workspace.path);
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

  private getConfigWriters(): [string, ConfigWriterEntry[]][] {
    return this.configWriterSlot.toArray();
  }

  private getFlatConfigWriters(): ConfigWriterEntry[] {
    return this.getConfigWriters().reduce((acc: ConfigWriterEntry[], [, value]) => {
      acc = acc.concat(value);
      return acc;
    }, []);
  }

  /**
   * Clean config files written by the config-writers
   * @param envsExecutionContext
   * @param param1
   * @returns Array of paths of deleted config files
   */
  async clean({ dryRun, silent, writers }: WriteConfigFilesOptions): Promise<string[]> {
    const configWriters = this.getFlatConfigWriters();
    const filteredConfigWriters = writers
      ? configWriters.filter(
          (configWriter) => writers.includes(configWriter.name) || writers.includes(configWriter.cliName)
        )
      : configWriters;
    const paths = filteredConfigWriters
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
      .flat();
    if (dryRun) return paths;
    if (!silent) await this.promptForCleaning(paths);
    await this.deleteFiles(paths);
    return paths;
  }

  private async promptForCleaning(paths: string[]) {
    this.logger.clearStatusLine();
    const ok = await yesno({
      question: `${chalk.underline('The following paths will be deleted:')}
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

  registerConfigWriter(...configWriterEntries: ConfigWriterEntry[]) {
    this.configWriterSlot.register(configWriterEntries);
  }

  static slots = [Slot.withType<ConfigWriterEntry[]>()];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider(
    [cli, workspace, envs, loggerAspect]: [CLIMain, Workspace, EnvsMain, LoggerMain],
    _config,
    [configWriterSlot]: [ConfigWriterSlot]
  ) {
    const logger = loggerAspect.createLogger(WorkspaceConfigFilesAspect.id);
    const workspaceConfigFilesMain = new WorkspaceConfigFilesMain(configWriterSlot, workspace, envs, logger);
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
