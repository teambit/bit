import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { switchAction } from '../../../api/consumer';
import { applyVersionReport } from './merge-cmd';
import { MergeOptions, MergeStrategy } from '../../../consumer/versions-ops/merge-version';
import { LATEST } from '../../../constants';
import { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { SwitchProps } from '../../../consumer/lanes/switch-lanes';
import GeneralError from '../../../error/general-error';

export default class Switch extends Command {
  name = 'switch <lane>';
  description = `switch to the specified lane`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['c', 'create', 'create a new lane'],
    ['r', 'remote <scope>', 'fetch remote lane objects and switch to a local lane tracked to the remote'],
    ['n', 'as <as>', 'relevant when --remote flag is used. name a local lane differently than the remote lane'],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the checked out version. strategy should be "theirs", "ours" or "manual"'
    ],
    ['a', 'get-all', 'checkout all components in a lane include ones that do not exist in the workspace'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['j', 'json', 'return the output as JSON'],
    [
      '',
      'ignore-package-json',
      'do not generate package.json for the imported component(s). (it automatically enables skip-npm-install and save-dependencies-as-components flags)'
    ],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-dist', 'do not write dist files (when exist)']
  ];
  loader = true;

  action(
    [lane]: [string],
    {
      create = false,
      remote,
      as,
      merge,
      getAll = false,
      verbose = false,
      json = false,
      ignorePackageJson = false,
      skipNpmInstall = false,
      ignoreDist = false
    }: {
      create?: boolean;
      remote?: string;
      as?: string;
      merge?: MergeStrategy;
      getAll?: boolean;
      verbose?: boolean;
      override?: boolean;
      json?: boolean;
      ignorePackageJson?: boolean;
      skipNpmInstall?: boolean;
      ignoreDist?: boolean;
    }
  ): Promise<ApplyVersionResults> {
    let mergeStrategy;
    if (merge && R.is(String, merge)) {
      const options = Object.keys(MergeOptions);
      if (!options.includes(merge)) {
        throw new GeneralError(`merge must be one of the following: ${options.join(', ')}`);
      }
      mergeStrategy = merge;
    }
    const switchProps: SwitchProps = {
      create,
      laneName: lane,
      remoteScope: remote,
      merge: Boolean(merge),
      mergeStrategy,
      verbose,
      skipNpmInstall,
      ignorePackageJson,
      existingOnWorkspaceOnly: !getAll,
      ignoreDist,
      newLaneName: as
    };
    return switchAction(switchProps);
  }

  report({ components, version, failedComponents }: ApplyVersionResults): string {
    const isLatest = Boolean(version && version === LATEST);
    const isReset = !version;
    const getFailureOutput = () => {
      if (!failedComponents || !failedComponents.length) return '';
      const title = 'the checkout has been canceled on the following component(s)';
      const body = failedComponents
        .map(
          failedComponent =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${title}\n${body}\n\n`;
    };
    const getSuccessfulOutput = () => {
      if (!components || !components.length) return '';
      if (components.length === 1) {
        const component = components[0];
        const componentName = isReset ? component.id.toString() : component.id.toStringWithoutVersion();
        if (isReset) return `successfully reset ${chalk.bold(componentName)}\n`;
        const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(
          // $FlowFixMe version is defined when !isReset
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          isLatest ? component.id.version : version
        )}\n`;
        return `${title} ${applyVersionReport(components, false)}`;
      }
      if (isReset) {
        const title = 'successfully reset the following components\n\n';
        const body = components.map(component => chalk.bold(component.id.toString())).join('\n');
        return title + body;
      }
      // $FlowFixMe version is defined when !isReset
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const versionOutput = isLatest ? 'their latest version' : `version ${chalk.bold(version)}`;
      const title = `successfully switched the following components to ${versionOutput}\n\n`;
      const showVersion = isLatest || isReset;
      const componentsStr = applyVersionReport(components, true, showVersion);
      return title + componentsStr;
    };
    const failedOutput = getFailureOutput();
    const successOutput = getSuccessfulOutput();
    return failedOutput + successOutput;
  }
}
