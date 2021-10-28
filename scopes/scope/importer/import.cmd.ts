import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import R from 'ramda';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import { ImportOptions } from '@teambit/legacy/dist/consumer/component-ops/import-components';
import { MergeOptions, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/merge-version';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { immutableUnshift } from '@teambit/legacy/dist/utils';
import { formatPlainComponentItem, formatPlainComponentItemWithVersions } from '@teambit/legacy/dist/cli/chalk-box';
import { Importer } from './importer';

export default class ImportCmd implements Command {
  name = 'import [ids...]';
  shortDescription = 'import components into your current working area';
  group = 'collaborate';
  description = `import components into your current workspace.
  https://${BASE_DOCS_DOMAIN}/docs/sourcing-components
  ${WILDCARD_HELP('import')}`;
  alias = '';
  options = [
    ['p', 'path <path>', 'import components into a specific directory'],
    [
      'o',
      'objects',
      "import components objects only, don't write the components to the file system. This is a default behavior for import with no id",
    ],
    ['d', 'display-dependencies', 'display the imported dependencies'],
    ['O', 'override', 'override local changes'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['j', 'json', 'return the output as JSON'],
    ['', 'conf', 'write the configuration file (component.json) of the component (harmony components only)'],
    [
      '',
      'skip-npm-install',
      'do not install packages of the imported components. (it automatically enables save-dependencies-as-components flag)',
    ],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the imported version. strategy should be "theirs", "ours" or "manual"',
    ],
    ['', 'dependencies', 'EXPERIMENTAL. import all dependencies and write them to the workspace'],
    ['', 'dependents', 'EXPERIMENTAL. import component dependents to allow auto-tag updating them upon tag'],
    [
      '',
      'skip-lane',
      'EXPERIMENTAL. when checked out to a lane, do not import the component into the lane, save it on main',
    ],
    [
      '',
      'all-history',
      'relevant for fetching all components objects. avoid optimizations, fetch all history versions, always',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;
  _packageManagerArgs: string[]; // gets populated by yargs-adapter.handler().

  constructor(private importer: Importer) {}

  async report(
    [ids = []]: [string[]],
    {
      path,
      objects = false,
      displayDependencies = false,
      override = false,
      verbose = false,
      json = false,
      conf,
      skipNpmInstall = false,
      merge,
      skipLane = false,
      dependencies = false,
      dependents = false,
      allHistory = false,
    }: {
      path?: string;
      objects?: boolean;
      displayDependencies?: boolean;
      override?: boolean;
      verbose?: boolean;
      json?: boolean;
      conf?: string;
      skipNpmInstall?: boolean;
      merge?: MergeStrategy;
      skipLane?: boolean;
      dependencies?: boolean;
      dependents?: boolean;
      allHistory?: boolean;
    }
  ): Promise<any> {
    if (objects && merge) {
      throw new GeneralError('you cant use --objects and --merge flags combined');
    }
    if (override && merge) {
      throw new GeneralError('you cant use --override and --merge flags combined');
    }
    let mergeStrategy;
    if (merge && R.is(String, merge)) {
      const options = Object.keys(MergeOptions);
      if (!options.includes(merge)) {
        throw new GeneralError(`merge must be one of the following: ${options.join(', ')}`);
      }
      mergeStrategy = merge;
    }

    const importOptions: ImportOptions = {
      ids,
      verbose,
      merge: Boolean(merge),
      mergeStrategy,
      writeToPath: path,
      objectsOnly: objects,
      override,
      writeConfig: Boolean(conf),
      installNpmPackages: !skipNpmInstall,
      skipLane,
      importDependenciesDirectly: dependencies,
      importDependents: dependents,
      allHistory,
    };
    const importResults = await this.importer.import(importOptions, this._packageManagerArgs);
    const { importDetails } = importResults;

    if (json) {
      return JSON.stringify({ importDetails }, null, 4);
    }
    let dependenciesOutput;

    if (importResults.dependencies && !R.isEmpty(importResults.dependencies)) {
      const components = importResults.dependencies.map(R.prop('component'));
      const peerDependencies = R.flatten(
        importResults.dependencies.map(R.prop('dependencies')),
        importResults.dependencies.map(R.prop('devDependencies'))
      );

      const title =
        components.length === 1
          ? 'successfully imported one component'
          : `successfully imported ${components.length} components`;
      const componentDependencies = components.map((component) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const details = importDetails.find((c) => c.id === component.id.toStringWithoutVersion());
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (!details) throw new Error(`missing details of component ${component.id.toString()}`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return formatPlainComponentItemWithVersions(component, details);
      });
      const componentDependenciesOutput = [chalk.green(title)].concat(componentDependencies).join('\n');

      const peerDependenciesOutput =
        peerDependencies && !R.isEmpty(peerDependencies) && displayDependencies
          ? immutableUnshift(
              R.uniq(peerDependencies.map(formatPlainComponentItem)),
              chalk.green(`\n\nsuccessfully imported ${components.length} component dependencies`)
            ).join('\n')
          : '';

      dependenciesOutput = componentDependenciesOutput + peerDependenciesOutput;
    }

    const getImportOutput = () => {
      if (dependenciesOutput) return dependenciesOutput;
      return chalk.yellow('nothing to import');
    };

    return getImportOutput();
  }
}
