import { PathLinuxRelative } from '@teambit/legacy/dist/utils/path';
import format from 'string-format';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import { dirname, join } from 'path';
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
import { invertBy, uniq } from 'lodash';
import type { EnvsMain } from '@teambit/envs';
import { Logger, LoggerAspect } from '@teambit/logger';
import type { LoggerMain } from '@teambit/logger';
import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';
import { ConfigFile, ConfigWriterEntry, ExtendingConfigFile } from './config-writer-entry';
import { WsConfigCleanCmd, WsConfigCmd, WsConfigWriteCmd } from './ws-config.cmd';

export type ConfigWriterSlot = SlotRegistry<ConfigWriterEntry[]>;

export type CleanConfigFilesOptions = {
  silent?: boolean; // no prompt
  dryRun?: boolean;
};

export type WriteConfigFilesOptions = {
  clean?: boolean;
  silent?: boolean; // no prompt
  dedupe?: boolean;
  dryRun?: boolean;
  dryRunWithContent?: boolean;
};

export type WrittenConfigFile = Required<ConfigFile> & {
  filePath: string;
};

export type WrittenExtendingConfigFile = ExtendingConfigFile & {
  filePaths: string[];
};

type WrittenConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    configFile: WrittenConfigFile;
  };
};

type ExtendingConfigFilesMap = {
  [configFileHash: string]: {
    envIds: string[];
    extendingConfigFile: Required<ExtendingConfigFile>;
  };
};

type DedupedPaths = Array<{
  fileHash: string;
  paths: string[];
}>;

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
  // your aspect API goes here.
  async writeConfigFiles(options: WriteConfigFilesOptions = {}): Promise<WriteConfigFilesResult> {
    const execContext = await this.getExecContext();

    let cleanResults: string[] | undefined;
    if (options.clean) {
      cleanResults = await this.clean(options);
    }

    const aspectsWritersResults = await this.write(execContext, options);
    const totalWrittenFiles = aspectsWritersResults.reduce((acc, curr) => {
      return acc + curr.totalWrittenFiles;
    }, 0);
    const writeResults = { aspectsWritersResults, totalWrittenFiles };

    return { writeResults, cleanResults, wsDir: this.workspace.path };
  }

  async cleanConfigFiles(options: CleanConfigFilesOptions = {}): Promise<string[]> {
    // const execContext = await this.getExecContext();
    const cleanResults = await this.clean(options);
    return cleanResults;
  }

  private async write(
    envsExecutionContext: ExecutionContext[],
    opts: WriteConfigFilesOptions
  ): Promise<AspectWritersResults[]> {
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
  ): Promise<AspectWritersResults> {
    const results = await pMapSeries(configWriters, async (configWriter) => {
      return this.handleOneConfigFileWriter(configWriter, envCompsDirsMap, configsRootDir, envsExecutionContext, opts);
    });
    const totalWrittenFiles = results.reduce((acc, curr) => {
      return acc + curr.totalWrittenFiles;
    }, 0);
    return { aspectId, writersResult: results, totalWrittenFiles };
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
        this.buildExtendingConfigFilesMap(configWriter, writtenConfigFiles, envId, extendingConfigFilesMap);
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
    console.log(
      '🚀 ~ file: workspace-config-files.main.runtime.ts:159 ~ WorkspaceConfigFilesMain ~ awaitpMapSeries ~ extendingConfigFilesMap:',
      extendingConfigFilesMap
    );
    const fileHashPerDedupedPaths = dedupePaths(extendingConfigFilesMap, envCompsDirsMap);
    const extendingConfigFiles = await this.writeExtendingConfigFiles(
      extendingConfigFilesMap,
      fileHashPerDedupedPaths,
      opts
    );
    if (configWriter.postProcessExtendingConfigFiles) {
      await configWriter.postProcessExtendingConfigFiles(
        {
          workspaceDir: this.workspace.path,
          configsRootDir,
          writtenExtendingConfigFiles: extendingConfigFiles,
          envCompsDirsMap
        }
      );
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
    console.log('🚀 ~ file: workspace-config-files.main.runtime.ts:190 ~ WorkspaceConfigFilesMain ~ result:', result);
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
    console.log(
      '🚀 ~ file: workspace-config-files.main.runtime.ts:119 ~ WorkspaceConfigFilesMain ~ Object.entries ~ calculatedConfigFiles:',
      calculatedConfigFiles
    );
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
      await configWriter.postProcessConfigFiles(writtenConfigFiles, executionContext, envMapValue);
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
    console.log('🚀 ~ file: workspace-config-files.main.runtime.ts:158 ~ WorkspaceConfigFilesMain ~ res:', res);
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
            if (!opts.dryRun) {
              await fs.outputFile(filePath, configFile.content);
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
    extendingConfigFilesMap: ExtendingConfigFilesMap
  ) {
    const extendingConfigFile = this.generateExtendingFile(configWriter, writtenConfigFiles);
    if (!extendingConfigFile) return;
    if (!extendingConfigFilesMap[extendingConfigFile.hash]) {
      extendingConfigFilesMap[extendingConfigFile.hash] = { extendingConfigFile, envIds: [] };
    }
    extendingConfigFilesMap[extendingConfigFile.hash].envIds.push(envId);
  }

  private generateExtendingFile(
    configWriter: ConfigWriterEntry,
    writtenConfigFiles
  ): Required<ExtendingConfigFile> | undefined {
    const extendingConfigFile = configWriter.generateExtendingFile(writtenConfigFiles);
    if (!extendingConfigFile) return undefined;
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
  async clean({ dryRun, silent }: WriteConfigFilesOptions): Promise<string[]> {
    const configWriters = this.getFlatConfigWriters();
    const paths = configWriters
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
    ];
    cli.register(wsConfigCmd);
    return workspaceConfigFilesMain;
  }
}

function getAllPossibleDirsFromPaths(paths: PathLinuxRelative[]): PathLinuxRelative[] {
  const dirs = paths.map((p) => getAllParentsDirOfPath(p)).flat();
  dirs.push('.'); // add the root dir
  return uniq(dirs);
}

function getAllParentsDirOfPath(p: PathLinuxRelative): PathLinuxRelative[] {
  const all: string[] = [];
  let current = p;
  while (current !== '.') {
    all.push(current);
    current = dirname(current);
  }
  return all;
}

export function buildCompPathExtendingHashMap(
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  envCompsDirsMap: EnvCompsDirsMap
): CompPathExtendingHashMap {
  const map = Object.entries(extendingConfigFilesMap).reduce((acc, [hash, { envIds }]) => {
    envIds.forEach((envId) => {
      const envCompDirs = envCompsDirsMap[envId];
      envCompDirs.paths.forEach((compPath) => {
        acc[compPath] = hash;
      });
    });
    return acc;
  }, {});
  return map;
}

/**
 * easier to understand by an example:
 * input:
 * [
 *   { fileHash: hash1, paths: [ui/button, ui/form] },
 *   { fileHash: hash2, paths: [p/a1, p/a2] },
 *   { fileHash: hash3, paths: [p/n1] },
 * ]
 *
 * output:
 * [
 *   { fileHash: hash1, paths: [ui] },
 *   { fileHash: hash2, paths: [p] },
 *   { fileHash: hash3, paths: [p/n1] },
 * ]
 *
 * the goal is to minimize the amount of files to write per env if possible.
 * when multiple components of the same env share a root-dir, then, it's enough to write a file in that shared dir.
 * if in a shared-dir, some components using env1 and some env2, it finds the env that has the max number of
 * components, this env will be optimized. other components, will have the files written inside their dirs.
 */
export function dedupePaths(
  extendingConfigFilesMap: ExtendingConfigFilesMap,
  envCompsDirsMap: EnvCompsDirsMap
): DedupedPaths {
  console.log('🚀 ~ file: tsconfig-writer.ts:194 ~ dedupePaths ~ extendingConfigFilesMap:', extendingConfigFilesMap);
  const rootDir = '.';

  const compPathExtendingHashMap = buildCompPathExtendingHashMap(extendingConfigFilesMap, envCompsDirsMap);
  const allPaths = Object.keys(compPathExtendingHashMap);
  const allPossibleDirs = getAllPossibleDirsFromPaths(allPaths);

  const allPathsPerFileHash: { [path: string]: string | null } = {}; // null when parent-dir has same amount of comps per env.

  const calculateBestFileForDir = (dir: string) => {
    if (compPathExtendingHashMap[dir]) {
      // it's the component dir, so it's the file that should be written.
      allPathsPerFileHash[dir] = compPathExtendingHashMap[dir];
      return;
    }
    const allPathsShareSameDir = dir === rootDir ? allPaths : allPaths.filter((p) => p.startsWith(`${dir}/`));
    const countPerFileHash: { [fileHash: string]: number } = {};
    allPathsShareSameDir.forEach((p) => {
      const fileHash = compPathExtendingHashMap[p];
      if (countPerFileHash[fileHash]) countPerFileHash[fileHash] += 1;
      else countPerFileHash[fileHash] = 1;
    });
    const max = Math.max(...Object.values(countPerFileHash));
    const fileHashWithMax = Object.keys(countPerFileHash).filter((fileHash) => countPerFileHash[fileHash] === max);
    if (!fileHashWithMax.length) throw new Error(`must be at least one fileHash related to path "${dir}"`);
    if (fileHashWithMax.length > 1) allPathsPerFileHash[dir] = null;
    else allPathsPerFileHash[dir] = fileHashWithMax[0];
  };

  allPossibleDirs.forEach((dirPath) => {
    calculateBestFileForDir(dirPath);
  });

  // this is the actual deduping. if found a shorter path with the same env, then no need for this path.
  // in other words, return only the paths that their parent is null or has a different env.
  const dedupedPathsPerFileHash = Object.keys(allPathsPerFileHash).reduce((acc, current) => {
    if (allPathsPerFileHash[current] && allPathsPerFileHash[dirname(current)] !== allPathsPerFileHash[current]) {
      acc[current] = allPathsPerFileHash[current];
    }

    return acc;
  }, {});
  // rootDir parent is always rootDir, so leave it as is.
  if (allPathsPerFileHash[rootDir]) dedupedPathsPerFileHash[rootDir] = allPathsPerFileHash[rootDir];

  const fileHashPerDedupedPaths = invertBy(dedupedPathsPerFileHash);

  const dedupedPaths = Object.keys(fileHashPerDedupedPaths).map((fileHash) => ({
    fileHash,
    paths: fileHashPerDedupedPaths[fileHash],
  }));
  console.log('🚀 ~ file: tsconfig-writer.ts:250 ~ dedupedPaths ~ dedupedPaths:', dedupedPaths);
  return dedupedPaths;
}

WorkspaceConfigFilesAspect.addRuntime(WorkspaceConfigFilesMain);

export default WorkspaceConfigFilesMain;
