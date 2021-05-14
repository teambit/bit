import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';

export const MISSING_PACKAGES_FROM_OVERRIDES_LABEL = 'from overrides configuration';

export function getInvalidComponentLabel(error: Error) {
  switch (error.name) {
    case 'MainFileRemoved':
      return 'main-file was removed (use "bit add" with "--main" and "--id" flags to add a main file)';
    case 'MissingFilesFromComponent':
    case 'ComponentNotFoundInPath':
      return 'component files were deleted (use "bit remove [component_id]") or moved (use "bit move <old-dir> <new-dir>")';
    case 'ExtensionFileNotFound':
      // @ts-ignore error.path is set for ExtensionFileNotFound
      return `extension file is missing at ${chalk.bold(error.path)}`;
    case 'ComponentsPendingImport':
      return 'component objects are missing from the scope (use "bit import [component_id] --objects" to get them back)';
    case 'NoComponentDir':
      return `component files were added individually without root directory (invalid on Harmony. re-add as a directory or use "bit move --component" to help with the move)`;
    case 'IgnoredDirectory':
      return `component files or directory were ignored (probably by .gitignore)`;
    default:
      return error.name;
  }
}

export function componentIssueToString(value: string[] | string) {
  return Array.isArray(value) ? value.join(', ') : value;
}

export default function componentIssuesTemplate(components: ConsumerComponent[]) {
  function format(missingComponent) {
    return `${chalk.underline(chalk.cyan(missingComponent.id.toString()))}\n${formatIssues(missingComponent)}`;
  }

  const result = `\n${components.map(format).join('\n')}`;
  return result;
}

export function formatIssues(compWithIssues: ConsumerComponent) {
  return `       ${compWithIssues.issues?.toString()}\n`;
}
