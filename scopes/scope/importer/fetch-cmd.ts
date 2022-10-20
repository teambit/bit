import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import { FileStatus } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/merge-version';
import { ImporterMain } from './importer.main.runtime';
import { ImportDetails, ImportStatus } from './import-components';

export class FetchCmd implements Command {
  name = 'fetch [ids...]';
  description = `fetch remote objects and store locally`;
  extendedDescription = `for lanes, use "/" as a separator between the remote and the lane name, e.g. teambit.ui/fix-button`;
  alias = '';
  private = true;
  options = [
    [
      'l',
      'lanes',
      'EXPERIMENTAL. fetch component objects from lanes. note, it does not save the remote lanes objects locally, only the refs',
    ],
    ['c', 'components', 'fetch components'],
    ['j', 'json', 'return the output as JSON'],
    [
      '',
      'from-original-scopes',
      'fetch indirect dependencies from their original scope as opposed to from their dependents',
    ],
  ] as CommandOptions;
  loader = true;

  constructor(private importer: ImporterMain) {}

  async report(
    [ids = []]: [string[]],
    {
      lanes = false,
      components = false,
      json = false,
      fromOriginalScope = false,
    }: {
      lanes?: boolean;
      components?: boolean;
      json?: boolean;
      fromOriginalScope?: boolean;
    }
  ) {
    const { importedIds, importDetails } = await this.importer.fetch(ids, lanes, components, fromOriginalScope);
    if (json) {
      return JSON.stringify({ importDetails }, null, 4);
    }
    if (importedIds.length) {
      const title =
        importedIds.length === 1
          ? 'successfully fetched one component'
          : `successfully fetched ${importedIds.length} components`;
      const componentDependencies = importedIds.map((id) => {
        const details = importDetails.find((c) => c.id === id.toStringWithoutVersion());
        if (!details) throw new Error(`missing details of component ${id.toString()}`);
        return formatPlainComponentItemWithVersions(id, details);
      });
      const componentDependenciesOutput = [chalk.green(title)].concat(componentDependencies).join('\n');

      return componentDependenciesOutput;
    }
    return chalk.yellow('nothing to import');
  }
}

function formatPlainComponentItemWithVersions(bitId: BitId, importDetails: ImportDetails) {
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
