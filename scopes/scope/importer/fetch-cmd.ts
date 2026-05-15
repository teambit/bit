import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSuccessSummary, formatHint } from '@teambit/cli';
import type { ComponentID } from '@teambit/component-id';
import { FileStatus } from '@teambit/component.modules.merge-helper';
import type { ImporterMain } from './importer.main.runtime';
import type { ImportDetails, ImportStatus } from './import-components';
import { fetchCommand } from './importer.commands';

export class FetchCmd implements Command {
  name = fetchCommand.name;
  description = fetchCommand.description;
  extendedDescription = fetchCommand.extendedDescription;
  group = fetchCommand.group;
  alias = fetchCommand.alias;
  private = fetchCommand.private;
  options = fetchCommand.options;
  loader = fetchCommand.loader;

  constructor(private importer: ImporterMain) {}

  async report(
    [ids = []]: [string[]],
    {
      lanes = false,
      components = false,
      fromOriginalScope = false,
      allHistory = false,
    }: {
      lanes?: boolean;
      components?: boolean;
      fromOriginalScope?: boolean;
      allHistory?: boolean;
    }
  ) {
    const { importedIds, importDetails } = await this.importer.fetch(
      ids,
      lanes,
      components,
      fromOriginalScope,
      allHistory
    );

    if (!importedIds.length) {
      return formatHint('nothing to import');
    }
    const title = formatSuccessSummary(`fetched ${importedIds.length} component(s)`);
    if (!importDetails) {
      // in case it fetches from a scope, when a workspace is not available.
      const comps = importedIds.map((id) => formatItem(id.toString()));
      return [title].concat(comps).join('\n');
    }

    const componentDependencies = importedIds.map((id) => {
      const details = importDetails.find((c) => c.id === id.toStringWithoutVersion());
      if (!details) throw new Error(`missing details for component ${id.toString()}`);
      return formatPlainComponentItemWithVersions(id, details);
    });

    return [title].concat(componentDependencies).join('\n');
  }
}

function formatPlainComponentItemWithVersions(bitId: ComponentID, importDetails: ImportDetails) {
  const status: ImportStatus = importDetails.status;
  const id = bitId.toStringWithoutVersion();
  const versions = importDetails.versions.length ? `new versions: ${importDetails.versions.join(', ')}` : '';
  const usedVersion = status === 'added' ? `, currently used version ${bitId.version}` : '';
  const getConflictMessage = () => {
    if (!importDetails.filesStatus) return '';
    const conflictedFiles = Object.keys(importDetails.filesStatus) // $FlowFixMe file is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .filter((file) => importDetails.filesStatus[file] === FileStatus.manual);
    if (!conflictedFiles.length) return '';
    return `(the following files were saved with conflicts ${conflictedFiles
      .map((file) => chalk.bold(file))
      .join(', ')}) `;
  };
  const deprecated = importDetails.deprecated ? chalk.yellow('deprecated') : '';
  const missingDeps = importDetails.missingDeps.length
    ? chalk.red(`missing dependencies: ${importDetails.missingDeps.map((d) => d.toString()).join(', ')}`)
    : '';
  return `- ${chalk.green(status)} ${chalk.cyan(
    id
  )} ${versions}${usedVersion} ${getConflictMessage()}${deprecated} ${missingDeps}`;
}
