import format from 'string-format';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { join } from 'path';
import globby from 'globby';
import chalk from 'chalk';
import { PromptCanceled } from '@teambit/legacy/dist/prompts/exceptions';
import pMapSeries from 'p-map-series';
import yesno from 'yesno';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import { Environment, EnvsAspect, ExecutionContext } from '@teambit/envs';
import type { EnvsMain } from '@teambit/envs';
import { Logger, LoggerAspect } from '@teambit/logger';
import type { LoggerMain } from '@teambit/logger';
import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';
import { ConfigFile, ConfigWriterEntry } from './config-writer-entry';
import WriteConfigsCmd from './write-configs.cmd';

export type ConfigWriterSlot = SlotRegistry<ConfigWriterEntry[]>;

export type WriteConfigFilesOptions = {
  clean?: boolean;
  silent?: boolean; // no prompt
  dedupe?: boolean;
  dryRun?: boolean;
  dryRunWithContent?: boolean;
};

export type WrittenConfigFile = {
  name: string;
  hash: string;
  filePath: string;
  content: string;
};

type ExtendingConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    extendingConfigFile: Required<ConfigFile>;
  };
};

export type EnvMapValue = { env: Environment; id: string[]; paths: string[] };
export type EnvCompsDirsMap = { [envId: string]: EnvMapValue };

export type EnvWrittenConfigFile = { envIds: string[]; content: string; paths: string[] };
export type AspectWrittenConfigFiles = { aspectId: string; writtenConfigFiles: EnvWrittenConfigFile[] };

export class WorkspaceConfigFilesMain {
  constructor(
    readonly configWriterSlot: ConfigWriterSlot,
    private workspace: Workspace,
    private envs: EnvsMain,
    private logger: Logger
  ) {}
  // your aspect API goes here.
  async writeConfigFiles(options: WriteConfigFilesOptions = {}): Promise<{
    cleanResults?: string[];
    writeResults: AspectWrittenConfigFiles[];
  }> {
    const execContext = await this.getExecContext();

    let cleanResults: string[] | undefined;
    if (options.clean) {
      cleanResults = await this.clean(execContext, options);
    }

    const writeResults = await this.write(execContext, options);

    return { writeResults, cleanResults };
  }

  private async write(
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<AspectWrittenConfigFiles[]> {
    console.log('🚀 ~ file: workspace-config-files.main.runtime.ts:66 ~ WorkspaceConfigFilesMain ~');
    const envCompDirsMap = this.getEnvComponentsDirsMap(envsExecutionContext);
    const slotEntries = this.configWriterSlot.toArray();
    console.log(
      '🚀 ~ file: workspace-config-files.main.runtime.ts:83 ~ WorkspaceConfigFilesMain ~ slotEntries:',
      slotEntries
    );
    const configsRootDir = this.getConfigsRootDir();
    console.log(
      '🚀 ~ file: workspace-config-files.main.runtime.ts:70 ~ WorkspaceConfigFilesMain ~ configsRootDir:',
      configsRootDir
    );
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
  ): Promise<AspectWrittenConfigFiles> {
    const results = await pMapSeries(configWriters, async (configWriter) => {
      return this.handleOneConfigFileWriter(
        aspectId,
        configWriter,
        envCompsDirsMap,
        configsRootDir,
        envsExecutionContext,
        opts
      );
    });
    return { aspectId, writtenConfigFiles: results.flat() };
  }

  private async handleOneConfigFileWriter(
    aspectId: string,
    configWriter: ConfigWriterEntry,
    envCompsDirsMap: EnvCompsDirsMap,
    configsRootDir: string,
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<EnvWrittenConfigFile[]> {
    const extendingConfigFilesMap: ExtendingConfigFilesMap = {};
    await pMapSeries(Object.entries(envCompsDirsMap), async ([envId, envMapValue]) => {
      const executionContext = envsExecutionContext.find((context) => context.id === envId);
      if (!executionContext) throw new Error(`failed finding execution context for env ${envId}`);
      const calculatedConfigFiles = configWriter.calcConfigFiles(executionContext, envMapValue.env, configsRootDir);
      console.log(
        '🚀 ~ file: workspace-config-files.main.runtime.ts:119 ~ WorkspaceConfigFilesMain ~ Object.entries ~ calculatedConfigFiles:',
        calculatedConfigFiles
      );
      if (!calculatedConfigFiles) return;
      const writtenConfigFiles = await Promise.all(
        calculatedConfigFiles.map((configFile) => {
          return this.writeConfigFile(configFile, configsRootDir, opts);
        })
      );
      if (configWriter.postProcessConfigFiles){
        await configWriter.postProcessConfigFiles(writtenConfigFiles, executionContext, envMapValue);
      }
      const extendingConfigFile = this.generateExtendingFile(configWriter, writtenConfigFiles);
      if (!extendingConfigFilesMap[extendingConfigFile.hash]) {
        extendingConfigFilesMap[extendingConfigFile.hash] = { extendingConfigFile, envIds: [] };
      }
      extendingConfigFilesMap[extendingConfigFile.hash].envIds.push(envId);
    });
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
    console.log('🚀 ~ file: workspace-config-files.main.runtime.ts:158 ~ WorkspaceConfigFilesMain ~ res:', res);
    return res;
  }

  private generateExtendingFile(configWriter: ConfigWriterEntry, writtenConfigFiles): Required<ConfigFile> {
    const extendingConfigFile = configWriter.generateExtendingFile(writtenConfigFiles);
    const hash = extendingConfigFile.hash || sha1(extendingConfigFile.content);
    return {
      ...extendingConfigFile,
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
  async clean(
    envsExecutionContext: ExecutionContext[],
    { dryRun, silent }: WriteConfigFilesOptions
  ): Promise<string[]> {
    const configWriters = this.getFlatConfigWriters();
    const patternsFlattened = configWriters.map((configWriter) => configWriter.patterns).flat();
    const paths = globby.sync(patternsFlattened, { cwd: this.workspace.path });
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
    await Promise.all(paths.map((f) => fs.remove(f)));
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
    const writeTsconfigCmd = new WriteConfigsCmd(workspaceConfigFilesMain);
    cli.register(writeTsconfigCmd);
    return workspaceConfigFilesMain;
  }
}

WorkspaceConfigFilesAspect.addRuntime(WorkspaceConfigFilesMain);

export default WorkspaceConfigFilesMain;
