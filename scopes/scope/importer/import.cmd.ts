import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { compact, uniq } from 'lodash';
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
import { immutableUnshift } from '@teambit/legacy.utils';
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
};

export class ImportCmd implements Command {
  name = 'import [component-patterns...]';
  description = 'bring components from remote scopes into your workspace';
  helpUrl = 'reference/components/importing-components';
  arguments = [
    {
      name: 'component-patterns...',
      description:
        'component IDs or component patterns (separated by space). Use patterns to import groups of components using a common scope or namespace. E.g., "utils/*" (wrap with double quotes)',
    },
  ];
  extendedDescription = `brings component source files from remote scopes into your workspace and installs their dependencies as packages.
supports pattern matching for bulk imports, merge strategies for handling conflicts, and various optimization options.
without arguments, fetches all workspace components' latest versions from their remote scopes.`;
  group = 'collaborate';
  alias = '';
  options = [
    ['p', 'path <path>', 'import components into a specific directory (a relative path in the workspace)'],
    [
      'o',
      'objects',
      'import components objects to the local scope without checkout (without writing them to the file system). This is the default behavior for import with no id argument',
    ],
    ['O', 'override', 'override local changes'],
    ['v', 'verbose', 'show verbose output for inspection'],
    ['j', 'json', 'return the output as JSON'],
    // ['', 'conf', 'write the configuration file (component.json) of the component'], // not working. need to fix once ComponentWriter is moved to Harmony
    ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
    ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the imported version. strategy should be "theirs", "ours" or "manual"',
    ],
    [
      '',
      'dependencies',
      'import all dependencies (bit components only) of imported components and write them to the workspace',
    ],
    ['', 'dependencies-head', 'same as --dependencies, except it imports the dependencies with their head version'],
    [
      '',
      'dependents',
      'import components found while traversing from the imported components upwards to the workspace components',
    ],
    [
      '',
      'dependents-via <string>',
      'same as --dependents except the traversal must go through the specified component. to specify multiple components, wrap with quotes and separate by a comma',
    ],
    [
      '',
      'dependents-all',
      'same as --dependents except not prompting for selecting paths but rather selecting all paths and showing final confirmation before importing',
    ],
    [
      '',
      'dependents-dry-run',
      'DEPRECATED. (this is the default now). same as --dependents, except it prints the found dependents and wait for confirmation before importing them',
    ],
    ['', 'silent', 'no prompt for --dependents/--dependents-via flags'],
    [
      '',
      'filter-envs <envs>',
      'only import components that have the specified environment (e.g., "teambit.react/react-env")',
    ],
    [
      '',
      'save-in-lane',
      'when checked out to a lane and the component is not on the remote-lane, save it in the lane (defaults to save on main)',
    ],
    [
      '',
      'all-history',
      'relevant for fetching all components objects. avoid optimizations, fetch all history versions, always',
    ],
    [
      '',
      'fetch-deps',
      'fetch dependencies (bit components) objects to the local scope, but dont add to the workspace. Useful to resolve errors about missing dependency data',
    ],
    [
      '',
      'write-deps <workspace.jsonc|package.json>',
      'write all workspace component dependencies to package.json or workspace.jsonc, resolving conflicts by picking the ranges that match the highest versions',
    ],
    [
      '',
      'track-only',
      'do not write any component files, just create .bitmap entries of the imported components. Useful when the files already exist and just want to re-add the component to the bitmap',
    ],
    ['', 'include-deprecated', 'when importing with patterns, include deprecated components (default to exclude them)'],
    [
      '',
      'lane-only',
      'when using wildcards on a lane, only import components that exist on the lane (never from main)',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
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
    const importedComponents = importedIds.map((bitId) => {
      const details = importDetails.find((c) => c.id === bitId.toStringWithoutVersion());
      if (!details) throw new Error(`missing details for component ${bitId.toString()}`);
      if (details.status === 'up to date') {
        upToDateCount += 1;
      }
      return formatPlainComponentItemWithVersions(bitId, details);
    });
    const getWsConfigUpdateLogs = () => {
      const logs = workspaceConfigUpdateResult?.logs;
      if (!logs || !logs.length) return '';
      const logsStr = logs.join('\n');
      return `${chalk.underline('verbose logs of workspace config update')}\n${logsStr}`;
    };
    const upToDateSuffix = lane ? ' on the lane' : '';
    const upToDateStr = upToDateCount === 0 ? '' : `, ${upToDateCount} components are up to date${upToDateSuffix}`;
    const summary = `${summaryPrefix}${upToDateStr}`;
    const importOutput = compact(importedComponents).join('\n');
    const importedDepsOutput =
      importFlags.displayDependencies && importedDeps.length
        ? immutableUnshift(
            uniq(importedDeps.map(formatPlainComponentItem)),
            chalk.green(`\n\nsuccessfully imported ${importedDeps.length} component dependencies`)
          ).join('\n')
        : '';

    const output = compact([
      getWsConfigUpdateLogs(),
      importOutput,
      importedDepsOutput,
      formatMissingComponents(missingIds),
      getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
      installationErrorOutput(installationError),
      compilationErrorOutput(compilationError),
      chalk.green(summary),
    ]).join('\n\n');

    return output;
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
    };
    return this.importer.import(importOptions, this._packageManagerArgs);
  }
}

function formatMissingComponents(missing?: string[]) {
  if (!missing?.length) return '';
  const title = chalk.underline('Missing Components');
  const subTitle = `The following components are missing from the remote in the requested version, try running "bit status" to re-sync your .bitmap file
Also, check that the requested version exists on main or the checked out lane`;
  const body = chalk.red(missing.join('\n'));
  return `${title}\n${subTitle}\n${body}`;
}

function formatPlainComponentItem({ scope, name, version, deprecated }: any) {
  return chalk.cyan(
    `- ${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}  ${
      deprecated ? chalk.yellow('[deprecated]') : ''
    }`
  );
}

function formatPlainComponentItemWithVersions(bitId: ComponentID, importDetails: ImportDetails) {
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

  const statusOutput = `- ${chalk.green(status)}`;
  const idOutput = chalk.cyan(id);
  const versionOutput = compact([versions, usedVersion]).join(', ');
  const stateOutput = `${conflictMessage}${deprecated}${removed}`;
  const output = compact([statusOutput, idOutput, versionOutput, stateOutput, missingDeps]).join(' ');
  return chalk.dim(output);
}
