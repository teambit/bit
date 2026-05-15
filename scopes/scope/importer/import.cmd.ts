import type { Command, CommandOptions } from '@teambit/cli';
import {
  formatSection,
  formatItem,
  formatTitle,
  formatHint,
  formatSuccessSummary,
  warnSymbol,
  errorSymbol,
  joinSections,
} from '@teambit/cli';
import { importCommand } from './importer.commands';
import chalk from 'chalk';
import { uniq } from 'lodash';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import {
  installationErrorOutput,
  compilationErrorOutput,
  getWorkspaceConfigUpdateOutput,
  FileStatus,
  MergeOptions,
} from '@teambit/component.modules.merge-helper';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';

import type { ImporterMain } from './importer.main.runtime';
import type { ImportOptions, ImportDetails, ImportStatus, ImportResult } from './import-components';

type ImportFlags = {
  path?: string;
  objects?: boolean;
  displayDependencies?: boolean;
  override?: boolean;
  verbose?: boolean;
  json?: boolean;
  conf?: string;
  skipDependencyInstallation?: boolean;
  skipWriteConfigFiles?: boolean;
  merge?: MergeStrategy;
  filterEnvs?: string;
  saveInLane?: boolean;
  dependencies?: boolean;
  dependenciesHead?: boolean;
  dependents?: boolean;
  dependentsDryRun?: boolean;
  dependentsVia?: string;
  dependentsAll?: boolean;
  silent?: boolean;
  allHistory?: boolean;
  fetchDeps?: boolean;
  trackOnly?: boolean;
  includeDeprecated?: boolean;
  writeDeps?: 'package.json' | 'workspace.jsonc';
  laneOnly?: boolean;
  owner?: boolean;
};

export class ImportCmd implements Command {
  name = importCommand.name;
  description = importCommand.description;
  helpUrl = importCommand.helpUrl;
  arguments = importCommand.arguments;
  extendedDescription = importCommand.extendedDescription;
  group = importCommand.group;
  alias = importCommand.alias;
  options = importCommand.options;
  loader = importCommand.loader;
  remoteOp = importCommand.remoteOp;
  _packageManagerArgs: string[]; // gets populated by yargs-adapter.handler().

  constructor(private importer: ImporterMain) {}

  async report([ids = []]: [string[]], importFlags: ImportFlags): Promise<any> {
    const {
      importDetails,
      importedIds,
      importedDeps,
      installationError,
      compilationError,
      workspaceConfigUpdateResult,
      missingIds,
      cancellationMessage,
      lane,
    } = await this.getImportResults(ids, importFlags);
    if (!importedIds.length && !missingIds?.length) {
      return chalk.yellow(cancellationMessage || 'nothing to import');
    }
    const importedIdsUniqNoVersion = ComponentIdList.fromArray(importedIds).toVersionLatest();
    const summaryPrefix =
      importedIdsUniqNoVersion.length === 1
        ? 'successfully imported one component'
        : `successfully imported ${importedIdsUniqNoVersion.length} components`;

    let upToDateCount = 0;
    const importedComponents = importedIds
      .map((bitId) => {
        const details = importDetails.find((c) => c.id === bitId.toStringWithoutVersion());
        if (!details) throw new Error(`missing details for component ${bitId.toString()}`);
        if (details.status === 'up to date') {
          upToDateCount += 1;
        }
        return formatPlainComponentItemWithVersions(bitId, details);
      })
      .filter(Boolean) as string[];

    const getWsConfigUpdateLogs = () => {
      const logs = workspaceConfigUpdateResult?.logs;
      if (!logs || !logs.length) return '';
      const logsStr = logs.join('\n');
      return `${formatTitle('verbose logs of workspace config update')}\n${logsStr}`;
    };
    const upToDateSuffix = lane ? ' on the lane' : '';
    const upToDateStr = upToDateCount === 0 ? '' : `, ${upToDateCount} components are up to date${upToDateSuffix}`;
    const summary = `${summaryPrefix}${upToDateStr}`;

    const importOutput = importedComponents.length ? formatSection('imported components', '', importedComponents) : '';

    const importedDepsOutput =
      importFlags.displayDependencies && importedDeps.length
        ? formatSection('imported component dependencies', '', uniq(importedDeps.map(formatPlainComponentItem)))
        : '';

    const getRemovedWarning = () => {
      const removedDetails = importDetails.filter((d) => d.removed);
      if (!removedDetails.length) return '';
      const removedItems = removedDetails.map((d) => formatItem(chalk.bold(d.id), errorSymbol));
      const hintBase = `run "bit recover <component-id>" to restore`;
      const hintSuffix = lane ? `, then "bit lane merge main" to get latest updates` : '';
      return joinSections([
        formatSection(
          'deleted components',
          'imported component(s) are marked as deleted and may not be up to date',
          removedItems
        ),
        formatHint(`${hintBase}${hintSuffix}`),
      ]);
    };

    return joinSections([
      getWsConfigUpdateLogs(),
      importOutput,
      importedDepsOutput,
      formatMissingComponents(missingIds),
      getRemovedWarning(),
      getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
      installationErrorOutput(installationError),
      compilationErrorOutput(compilationError),
      formatSuccessSummary(summary),
    ]);
  }

  async json([ids]: [string[]], importFlags: ImportFlags) {
    const { importDetails, installationError, missingIds } = await this.getImportResults(ids, importFlags);

    return { importDetails, installationError, missingIds };
  }

  private async getImportResults(
    ids: string[],
    {
      path,
      objects = false,
      override = false,
      verbose = false,
      conf,
      skipDependencyInstallation = false,
      skipWriteConfigFiles = false,
      merge,
      filterEnvs,
      saveInLane = false,
      dependencies = false,
      dependenciesHead = false,
      dependents = false,
      dependentsDryRun = false,
      silent,
      dependentsVia,
      dependentsAll,
      allHistory = false,
      fetchDeps = false,
      trackOnly = false,
      includeDeprecated = false,
      writeDeps,
      laneOnly = false,
      owner = false,
    }: ImportFlags
  ): Promise<ImportResult> {
    if (dependentsDryRun) {
      this.importer.logger.warn(`the "--dependents-dry-run" flag is deprecated and is now the default behavior`);
    }
    if (objects && merge) {
      throw new BitError(' --objects and --merge flags cannot be used together');
    }
    if (override && merge) {
      throw new BitError('--override and --merge cannot be used together');
    }
    if (!ids.length && dependencies) {
      throw new BitError('you have to specify ids to use "--dependencies" flag');
    }
    if (!ids.length && dependenciesHead) {
      throw new BitError('you have to specify ids to use "--dependencies-head" flag');
    }
    if (!ids.length && dependents) {
      throw new BitError('you have to specify ids to use "--dependents" flag');
    }
    if (!ids.length && dependentsVia) {
      throw new BitError('you have to specify ids to use "--dependents-via" flag');
    }
    if (!ids.length && trackOnly) {
      throw new BitError('you have to specify ids to use "--track-only" flag');
    }
    if (owner && ids.length !== 1) {
      throw new BitError('--owner flag requires exactly one argument (the owner name)');
    }
    let mergeStrategy;
    if (merge && typeof merge === 'string') {
      const options = Object.keys(MergeOptions);
      if (!options.includes(merge)) {
        throw new BitError(`merge must be one of the following: ${options.join(', ')}`);
      }
      mergeStrategy = merge;
    }

    const envsToFilter = filterEnvs ? filterEnvs.split(',').map((p) => p.trim()) : undefined;

    const importOptions: ImportOptions = {
      ids,
      verbose,
      merge: Boolean(merge),
      filterEnvs: envsToFilter,
      mergeStrategy,
      writeToPath: path,
      objectsOnly: objects,
      override,
      writeConfig: Boolean(conf),
      installNpmPackages: !skipDependencyInstallation,
      writeConfigFiles: !skipWriteConfigFiles,
      saveInLane,
      importDependenciesDirectly: dependencies,
      importHeadDependenciesDirectly: dependenciesHead,
      importDependents: dependents,
      dependentsVia,
      dependentsAll,
      silent,
      allHistory,
      fetchDeps,
      trackOnly,
      includeDeprecated,
      writeDeps,
      laneOnly,
      owner,
    };
    return this.importer.import(importOptions, this._packageManagerArgs);
  }
}

function formatMissingComponents(missing?: string[]) {
  if (!missing?.length) return '';
  const desc = `the following components are missing from the remote in the requested version, try running "bit status" to re-sync your .bitmap file\nalso, check that the requested version exists on main or the checked out lane`;
  const items = missing.map((id) => formatItem(chalk.red(id), errorSymbol));
  return formatSection('missing components', desc, items);
}

function formatPlainComponentItem({ scope, name, version, deprecated }: any) {
  const id = `${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}`;
  const suffix = deprecated ? ` ${chalk.yellow('[deprecated]')}` : '';
  return formatItem(chalk.cyan(id) + suffix);
}

function formatPlainComponentItemWithVersions(bitId: ComponentID, importDetails: ImportDetails): string | undefined {
  const status: ImportStatus = importDetails.status;
  const id = bitId.toStringWithoutVersion();
  let usingLatest = '';
  const getVersionsOutput = () => {
    if (!importDetails.versions.length) return '';
    if (importDetails.latestVersion) {
      if (importDetails.latestVersion === bitId.version && status === 'added') {
        usingLatest = ' (latest)';
        return '';
      }
      return `${importDetails.versions.length} new version(s) available, latest ${importDetails.latestVersion}`;
    }
    return importDetails.versions.length > 5
      ? `${importDetails.versions.length} new versions`
      : `new versions: ${importDetails.versions.join(', ')}`;
  };
  const versions = getVersionsOutput();
  const usedVersion = status === 'added' ? `currently used version ${bitId.version}${usingLatest}` : '';
  const getConflictMessage = () => {
    if (!importDetails.filesStatus) return '';
    const conflictedFiles = Object.keys(importDetails.filesStatus)
      // @ts-ignore file is set
      .filter((file) => importDetails.filesStatus[file] === FileStatus.manual);
    if (!conflictedFiles.length) return '';
    return `(the following files were saved with conflicts ${conflictedFiles
      .map((file) => chalk.bold(file))
      .join(', ')}) `;
  };
  const conflictMessage = getConflictMessage();
  const deprecated = importDetails.deprecated && !importDetails.removed ? chalk.yellow('deprecated') : '';
  const removed = importDetails.removed ? chalk.red('deleted') : '';
  const missingDeps = importDetails.missingDeps.length
    ? chalk.red(`missing dependencies: ${importDetails.missingDeps.map((d) => d.toString()).join(', ')}`)
    : '';
  if (status === 'up to date' && !missingDeps && !deprecated && !conflictMessage && !removed) {
    return undefined;
  }

  const symbol = removed ? errorSymbol : deprecated ? warnSymbol : undefined;
  const versionOutput = [versions, usedVersion].filter(Boolean).join(', ');
  const stateOutput = `${conflictMessage}${deprecated}${removed}`;
  const details = [chalk.green(status), chalk.cyan(id), versionOutput, stateOutput, missingDeps]
    .filter(Boolean)
    .join(' ');
  return formatItem(chalk.dim(details), symbol);
}
