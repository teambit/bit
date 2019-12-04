import chalk from 'chalk';
import R from 'ramda';
import ConsumerComponent from '../../consumer/component/consumer-component';
import { UntrackedFileDependencyEntry } from '../../consumer/component/dependencies/dependency-resolver/dependencies-resolver';
import { MISSING_DEPS_SPACE, MISSING_NESTED_DEPS_SPACE } from '../../constants';
import Component from '../../consumer/component/consumer-component';
import { Analytics } from '../../analytics/analytics';

export const componentIssuesLabels = {
  missingPackagesDependenciesOnFs:
    'missing packages dependencies (use your package manager to make sure all package dependencies are installed)',
  missingComponents:
    'missing components (use "bit import" or your package manager to make sure all components are installed)',
  untrackedDependencies: 'untracked file dependencies (use "bit add <file>" to track untracked files as components)',
  missingDependenciesOnFs: 'non-existing dependency files (please make sure all files exists on your workspace)',
  missingLinks: 'missing links (use "bit link" to build missing component links)',
  missingCustomModuleResolutionLinks: 'missing links (use "bit link" to build missing component links)',
  relativeComponents: 'components with relative import statements (please use absolute paths for imported components)',
  parseErrors: 'error found while parsing the file (please edit the file and fix the parsing error)',
  resolveErrors: 'error found while resolving the file dependencies (see the log for the full error)'
};

export function getInvalidComponentLabel(error: Error) {
  switch (error.name) {
    case 'MainFileRemoved':
      return 'main-file was removed (use "bit add" with "--main" and "--id" flags to add a main file)';
    case 'MissingFilesFromComponent':
    case 'ComponentNotFoundInPath':
      return 'component files were deleted (use "bit remove [component_id]" or "bit untrack [component_id]" to remove the component from your workspace)';
    case 'ExtensionFileNotFound': // $FlowFixMe error.path is set for ExtensionFileNotFound
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return `extension file is missing at ${chalk.bold(error.path)}`;
    case 'ComponentsPendingImport':
      return 'component objects are missing from the scope (use "bit import [component_id] --objects" to get them back)';
    default:
      return error.name;
  }
}

export function componentIssueToString(value: string[] | string) {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function untrackedFilesComponentIssueToString(value: UntrackedFileDependencyEntry) {
  const colorizedMap = value.untrackedFiles.map(curr => {
    if (curr.existing) {
      return `${chalk.yellow(curr.relativePath)}`;
    }
    return curr.relativePath;
  });
  return colorizedMap.join(', ');
}

export default function componentIssuesTemplate(components: ConsumerComponent[]) {
  function format(missingComponent) {
    return `${chalk.underline(chalk.cyan(missingComponent.id.toString()))}\n${formatMissing(missingComponent)}`;
  }

  const result = `\n${components.map(format).join('\n')}`;
  return result;
}

export function formatMissing(missingComponent: Component) {
  function formatMissingStr(key: string, value, label, formatIssueFunc: (any) => string = componentIssueToString) {
    if (!value || R.isEmpty(value)) return '';

    return (
      chalk.yellow(`\n       ${label}: \n`) +
      chalk.white(
        Object.keys(value)
          .map(k => {
            let space = MISSING_DEPS_SPACE;
            if (value[k].nested) {
              space = MISSING_NESTED_DEPS_SPACE;
            }
            return `${space}${k} -> ${formatIssueFunc(value[k])}`;
          })
          .join('\n')
      )
    );
  }

  const missingStr = Object.keys(componentIssuesLabels)
    .map(key => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (missingComponent.issues[key]) Analytics.incExtraDataKey(key);
      if (key === 'untrackedDependencies') {
        // @ts-ignore
        return formatMissingStr(
          key,
          missingComponent.issues[key],
          componentIssuesLabels[key],
          untrackedFilesComponentIssueToString
        );
      }
      return formatMissingStr(key, missingComponent.issues[key], componentIssuesLabels[key]);
    })
    .join('');
  return `       ${missingStr}\n`;
}
