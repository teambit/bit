import chalk from 'chalk';
import R from 'ramda';

import { importAction } from '../../../api/consumer';
import { EnvironmentOptions } from '../../../api/consumer/lib/import';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import Component from '../../../consumer/component';
import { ImportDetails, ImportOptions } from '../../../consumer/component-ops/import-components';
import { MergeOptions, MergeStrategy } from '../../../consumer/versions-ops/merge-version/merge-version';
import GeneralError from '../../../error/general-error';
import { ComponentWithDependencies } from '../../../scope';
import { immutableUnshift } from '../../../utils';
import { formatPlainComponentItem, formatPlainComponentItemWithVersions } from '../../chalk-box';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Import implements LegacyCommand {
  name = 'import [ids...]';
  shortDescription = 'import components into your current working area';
  group: Group = 'collaborate';
  description = `import components into your current workspace.
  https://${BASE_DOCS_DOMAIN}/docs/sourcing-components
  ${WILDCARD_HELP('import')}`;
  alias = '';
  opts = [
    ['t', 'tester', 'import a tester environment component'],
    ['c', 'compiler', 'import a compiler environment component'],
    ['e', 'environment', 'install development environment dependencies (compiler and tester)'],
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
    ['', 'ignore-dist', "skip writing the component's build files during import"],
    ['', 'conf', 'write the configuration file (component.json) of the component (harmony components only)'],
    [
      '',
      'skip-npm-install',
      'do not install packages of the imported components. (it automatically enables save-dependencies-as-components flag)',
    ],
    [
      '',
      'ignore-package-json',
      'do not generate package.json for the imported component(s). (it automatically enables skip-npm-install and save-dependencies-as-components flags)',
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
      'EXPERIMENTAL. when checked out to a lane, do not import the component into the lane, save it on master',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  action(
    [ids]: [string[]],
    {
      tester = false,
      compiler = false,
      path,
      objects = false,
      displayDependencies = false,
      environment = false,
      override = false,
      verbose = false,
      json = false,
      ignoreDist = false,
      conf,
      skipNpmInstall = false,
      ignorePackageJson = false,
      merge,
      skipLane = false,
      dependencies = false,
      dependents = false,
    }: {
      tester?: boolean;
      compiler?: boolean;
      path?: string;
      objects?: boolean;
      displayDependencies?: boolean;
      environment?: boolean;
      override?: boolean;
      verbose?: boolean;
      json?: boolean;
      ignoreDist?: boolean;
      conf?: string;
      skipNpmInstall?: boolean;
      ignorePackageJson?: boolean;
      merge?: MergeStrategy;
      skipLane?: boolean;
      dependencies?: boolean;
      dependents?: boolean;
    },
    packageManagerArgs: string[]
  ): Promise<any> {
    if (tester && compiler) {
      throw new GeneralError('you cant use tester and compiler flags combined');
    }
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
    const environmentOptions: EnvironmentOptions = {
      tester,
      compiler,
    };

    const importOptions: ImportOptions = {
      ids,
      verbose,
      merge: !!merge,
      mergeStrategy,
      writeToPath: path,
      objectsOnly: objects,
      withEnvironments: environment,
      override,
      writeDists: !ignoreDist,
      writeConfig: !!conf,
      installNpmPackages: !skipNpmInstall,
      writePackageJson: !ignorePackageJson,
      skipLane,
      importDependenciesDirectly: dependencies,
      importDependents: dependents,
    };
    return importAction(environmentOptions, importOptions, packageManagerArgs).then((importResults) => ({
      displayDependencies,
      json,
      ...importResults,
    }));
  }

  report({
    dependencies,
    envComponents,
    importDetails,
    warnings,
    displayDependencies,
    json,
  }: {
    dependencies?: ComponentWithDependencies[];
    envComponents?: Component[];
    importDetails: ImportDetails[];
    warnings?: {
      notInPackageJson: [];
      notInNodeModules: [];
      notInBoth: [];
    };
    displayDependencies: boolean;
    json: boolean;
  }): string {
    if (json) {
      return JSON.stringify({ importDetails, warnings }, null, 4);
    }
    let dependenciesOutput;
    let envComponentsOutput;

    if (dependencies && !R.isEmpty(dependencies)) {
      const components = dependencies.map(R.prop('component'));
      const peerDependencies = R.flatten(
        dependencies.map(R.prop('dependencies')),
        dependencies.map(R.prop('devDependencies'))
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

    if (envComponents && !R.isEmpty(envComponents)) {
      envComponentsOutput = immutableUnshift(
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        envComponents.map((envDependency) => formatPlainComponentItem(envDependency.component)),
        chalk.green('the following component environments were installed')
      ).join('\n');
    }

    const getImportOutput = () => {
      if (dependenciesOutput && !envComponentsOutput) return dependenciesOutput;
      if (!dependenciesOutput && envComponentsOutput) return envComponentsOutput;
      if (dependenciesOutput && envComponentsOutput) {
        return `${dependenciesOutput}\n\n${envComponentsOutput}`;
      }

      return chalk.yellow('nothing to import');
    };

    const logObject = (obj) => `> ${R.keys(obj)[0]}: ${R.values(obj)[0]}`;
    const getWarningOutput = () => {
      if (!warnings) return '';
      let output = '\n';

      if (!R.isEmpty(warnings.notInBoth)) {
        output += chalk.red.underline(
          '\nerror - missing the following package dependencies. please install and add to package.json.\n'
        );
        output += chalk.red(`${warnings.notInBoth.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInPackageJson)) {
        output += chalk.yellow.underline('\nwarning - add the following packages to package.json\n');
        output += chalk.yellow(`${warnings.notInPackageJson.map(logObject).join('\n')}\n`);
      }

      if (!R.isEmpty(warnings.notInNodeModules)) {
        output += chalk.yellow.underline('\nwarning - following packages are not installed. please install them.\n');
        output += chalk.yellow(`${warnings.notInNodeModules.map(logObject).join('\n')}\n`);
      }

      return output === '\n' ? '' : output;
    };

    return getImportOutput() + getWarningOutput();
  }
}
