import semver from 'semver';
import { isEmpty } from 'lodash';
import { DependencyResolverAspect, WorkspacePolicyConfigKeysNames } from '@teambit/dependency-resolver';
import tempy from 'tempy';
import fs from 'fs-extra';
import { MainRuntime } from '@teambit/cli';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { DEPENDENCIES_FIELDS } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import mergeFiles, { MergeFileParams } from '@teambit/legacy/dist/utils/merge-files';
import { ConfigAspect, ConfigMain } from '@teambit/config';
import { ConfigMergeResult, parseVersionLineWithConflict } from './config-merge-result';
import { ConfigMergerAspect } from './config-merger.aspect';

type PkgEntry = { name: string; version: string; force: boolean };

const WS_DEPS_FIELDS = ['dependencies', 'peerDependencies'];

export type WorkspaceDepsUpdates = { [pkgName: string]: [string, string] }; // from => to
export type WorkspaceDepsConflicts = Record<WorkspacePolicyConfigKeysNames, Array<{ name: string; version: string }>>; // the pkg value is in a format of CONFLICT::OURS::THEIRS

export class ConfigMergerMain {
  constructor(private workspace: Workspace, private logger: Logger, private config: ConfigMain) {}

  async generateConfigMergeConflictFileForAll(allConfigMerge: ConfigMergeResult[]) {
    const configMergeFile = this.workspace.getConflictMergeFile();
    allConfigMerge.forEach((configMerge) => {
      const conflict = configMerge.generateMergeConflictFile();
      if (!conflict) return;
      configMergeFile.addConflict(configMerge.compIdStr, conflict);
    });
    if (configMergeFile.hasConflict()) {
      await configMergeFile.write();
    }
  }

  async writeWorkspaceJsoncWithConflictsGracefully(
    workspaceDepsConflicts: WorkspaceDepsConflicts
  ): Promise<Error | undefined> {
    try {
      await this.writeWorkspaceJsoncWithConflicts(workspaceDepsConflicts);
      return undefined;
    } catch (err: any) {
      this.logger.error(`unable to write workspace.jsonc with conflicts`, err);
      const errTitle = `unable to write workspace.jsonc with conflicts, due to an error: "${err.message}".
see the conflicts below and edit your workspace.jsonc as you see fit.`;
      const conflictsStr = WS_DEPS_FIELDS.map((depField) => {
        if (!workspaceDepsConflicts[depField]) return [];
        return workspaceDepsConflicts[depField].map(({ name, version }) => {
          const { currentVal, otherVal } = parseVersionLineWithConflict(version);
          return `(${depField}) ${name}: ours: ${currentVal}, theirs: ${otherVal}`;
        });
      })
        .flat()
        .join('\n');
      return new BitError(`${errTitle}\n${conflictsStr}`);
    }
  }

  private async writeWorkspaceJsoncWithConflicts(workspaceDepsConflicts: WorkspaceDepsConflicts) {
    const wsConfig = this.config.workspaceConfig;
    if (!wsConfig) throw new Error(`unable to get workspace config`);
    const wsJsoncPath = wsConfig.path;
    const wsJsoncOriginalContent = await fs.readFile(wsJsoncPath, 'utf8');
    let wsJsoncContent = wsJsoncOriginalContent;
    WS_DEPS_FIELDS.forEach((depField) => {
      if (!workspaceDepsConflicts[depField]) return;
      workspaceDepsConflicts[depField].forEach(({ name, version }) => {
        const { currentVal, otherVal } = parseVersionLineWithConflict(version);
        // e.g. "@ci/8oypmb6p-remote.bar.foo": "^0.0.3"
        const originalDep = `"${name}": "${currentVal}"`;
        if (!wsJsoncContent.includes(originalDep)) {
          throw new Error(`unable to find the dependency ${originalDep} in the workspace.jsonc`);
        }
        wsJsoncContent = wsJsoncContent.replace(originalDep, `"${name}": "${otherVal}"`);
      });
    });

    const baseFilePath = await tempy.write('');
    const otherFilePath = await tempy.write(wsJsoncContent);
    const mergeFilesParams: MergeFileParams = {
      filePath: wsJsoncPath,
      currentFile: {
        label: 'ours',
        path: wsJsoncPath,
      },
      baseFile: {
        path: baseFilePath,
      },
      otherFile: {
        label: 'theirs',
        path: otherFilePath,
      },
    };
    const mergeResult = await mergeFiles(mergeFilesParams);
    const conflictFile = mergeResult.conflict;
    if (!conflictFile) {
      this.logger.debug(`original content:\n${wsJsoncOriginalContent}`);
      this.logger.debug(`new content:\n${wsJsoncContent}`);
      throw new Error('unable to generate conflict from the workspace.jsonc file. see debug.log for the file content');
    }
    await wsConfig.backupConfigFile('before writing conflicts');
    await fs.writeFile(wsJsoncPath, conflictFile);
  }

  async updateWorkspaceJsoncWithDepsIfNeeded(
    allConfigMerge: ConfigMergeResult[]
  ): Promise<{ workspaceDepsUpdates?: WorkspaceDepsUpdates; workspaceDepsConflicts?: WorkspaceDepsConflicts }> {
    const allResults = allConfigMerge.map((c) => c.getDepsResolverResult());

    // aggregate all dependencies that can be updated (not conflicting)
    const nonConflictDeps: { [pkgName: string]: string[] } = {};
    const nonConflictSources: { [pkgName: string]: string[] } = {}; // for logging/debugging purposes
    allConfigMerge.forEach((configMerge) => {
      const mergedConfig = configMerge.getDepsResolverResult()?.mergedConfig;
      if (!mergedConfig || mergedConfig === '-') return;
      const mergedConfigPolicy = mergedConfig.policy || {};
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!mergedConfigPolicy[depField]) return;
        mergedConfigPolicy[depField].forEach((pkg: PkgEntry) => {
          if (pkg.force) return; // we only care about auto-detected dependencies
          if (nonConflictDeps[pkg.name]) {
            if (!nonConflictDeps[pkg.name].includes(pkg.version)) nonConflictDeps[pkg.name].push(pkg.version);
            nonConflictSources[pkg.name].push(configMerge.compIdStr);
            return;
          }
          nonConflictDeps[pkg.name] = [pkg.version];
          nonConflictSources[pkg.name] = [configMerge.compIdStr];
        });
      });
    });

    // aggregate all dependencies that have conflicts
    const conflictDeps: { [pkgName: string]: string[] } = {};
    const conflictDepsSources: { [pkgName: string]: string[] } = {}; // for logging/debugging purposes
    allConfigMerge.forEach((configMerge) => {
      const mergedConfigConflict = configMerge.getDepsResolverResult()?.conflict;
      if (!mergedConfigConflict) return;
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!mergedConfigConflict[depField]) return;
        mergedConfigConflict[depField].forEach((pkg: PkgEntry) => {
          if (pkg.force) return; // we only care about auto-detected dependencies
          if (conflictDeps[pkg.name]) {
            if (!conflictDeps[pkg.name].includes(pkg.version)) conflictDeps[pkg.name].push(pkg.version);
            conflictDepsSources[pkg.name].push(configMerge.compIdStr);
            return;
          }
          conflictDeps[pkg.name] = [pkg.version];
          conflictDepsSources[pkg.name] = [configMerge.compIdStr];
        });
      });
    });

    const notConflictedPackages = Object.keys(nonConflictDeps);
    const conflictedPackages = Object.keys(conflictDeps);
    if (!notConflictedPackages.length && !conflictedPackages.length) return {};

    const workspaceConfig = this.config.workspaceConfig;
    if (!workspaceConfig) throw new Error(`updateWorkspaceJsoncWithDepsIfNeeded unable to get workspace config`);
    const depResolver = workspaceConfig.extensions.findCoreExtension(DependencyResolverAspect.id);
    const policy = depResolver?.config.policy;
    if (!policy) {
      return {};
    }

    // calculate the workspace.json updates
    const workspaceJsonUpdates = {};
    notConflictedPackages.forEach((pkgName) => {
      if (nonConflictDeps[pkgName].length > 1) {
        // we only want the deps that the other lane has them in the workspace.json and that all comps use the same dep.
        return;
      }
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!policy[depField]?.[pkgName]) return; // doesn't exists in the workspace.json
        const currentVer = policy[depField][pkgName];
        const newVer = nonConflictDeps[pkgName][0];
        if (currentVer === newVer) return;
        workspaceJsonUpdates[pkgName] = [currentVer, newVer];
        policy[depField][pkgName] = newVer;
        this.logger.debug(
          `update workspace.jsonc: ${pkgName} from ${currentVer} to ${newVer}. Triggered by: ${nonConflictSources[
            pkgName
          ].join(', ')}`
        );
      });
    });

    // calculate the workspace.json conflicts
    const workspaceJsonConflicts = { dependencies: [], peerDependencies: [] };
    const conflictPackagesToRemoveFromConfigMerge: string[] = [];
    conflictedPackages.forEach((pkgName) => {
      if (conflictDeps[pkgName].length > 1) {
        // we only want the deps that the other lane has them in the workspace.json and that all comps use the same dep.
        return;
      }
      const conflictRaw = conflictDeps[pkgName][0];
      const [, currentVal, otherVal] = conflictRaw.split('::');

      WS_DEPS_FIELDS.forEach((depField) => {
        if (!policy[depField]?.[pkgName]) return;
        const currentVerInWsJson = policy[depField][pkgName];
        if (!currentVerInWsJson) return;
        // the version is coming from the workspace.jsonc
        conflictPackagesToRemoveFromConfigMerge.push(pkgName);
        if (semver.satisfies(otherVal, currentVerInWsJson)) {
          // the other version is compatible with the current version in the workspace.json
          return;
        }
        workspaceJsonConflicts[depField].push({
          name: pkgName,
          version: conflictRaw.replace(currentVal, currentVerInWsJson),
          force: false,
        });
        conflictPackagesToRemoveFromConfigMerge.push(pkgName);
        this.logger.debug(
          `conflict workspace.jsonc: ${pkgName} current: ${currentVerInWsJson}, other: ${otherVal}. Triggered by: ${conflictDepsSources[
            pkgName
          ].join(', ')}`
        );
      });
    });
    WS_DEPS_FIELDS.forEach((depField) => {
      if (isEmpty(workspaceJsonConflicts[depField])) delete workspaceJsonConflicts[depField];
    });

    if (conflictPackagesToRemoveFromConfigMerge.length) {
      allResults.forEach((result) => {
        if (result?.conflict) {
          DEPENDENCIES_FIELDS.forEach((depField) => {
            if (!result.conflict?.[depField]) return;
            result.conflict[depField] = result.conflict?.[depField].filter(
              (dep) => !conflictPackagesToRemoveFromConfigMerge.includes(dep.name)
            );
            if (!result.conflict[depField].length) delete result.conflict[depField];
          });
          if (isEmpty(result.conflict)) result.conflict = undefined;
        }
      });
    }

    if (Object.keys(workspaceJsonUpdates).length) {
      await workspaceConfig.write({ reasonForChange: 'merge (update dependencies)' });
    }

    this.logger.debug('final workspace.jsonc updates', workspaceJsonUpdates);
    this.logger.debug('final workspace.jsonc conflicts', workspaceJsonConflicts);

    return {
      workspaceDepsUpdates: Object.keys(workspaceJsonUpdates).length ? workspaceJsonUpdates : undefined,
      workspaceDepsConflicts: Object.keys(workspaceJsonConflicts).length ? workspaceJsonConflicts : undefined,
    };
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, DependencyResolverAspect, ConfigAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([workspace, config, loggerMain]: [Workspace, ConfigMain, LoggerMain]) {
    const logger = loggerMain.createLogger(ConfigMergerAspect.id);
    return new ConfigMergerMain(workspace, logger, config);
  }
}

ConfigMergerAspect.addRuntime(ConfigMergerMain);

export default ConfigMergerMain;
