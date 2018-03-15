// @flow
import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';

export const missingDependenciesLabels = {
  missingPackagesDependenciesOnFs:
    'missing packages dependencies (use your package manager to make sure all package dependencies are installed)',
  missingComponents:
    'missing components (use "bit import" or your package manager to make sure all components are installed)',
  untrackedDependencies: 'untracked file dependencies (use "bit add <file>" to track untracked files as components)',
  missingDependenciesOnFs: 'non-existing dependency files (please make sure all files exists on your workspace)',
  missingLinks: 'missing links (use "bit link" to build missing component links)',
  relativeComponents: 'components with relative import statements (please use absolute paths for imported components)'
};

export default function missingDepsTemplate(components: ConsumerComponent[]) {
  function format(missingComponent) {
    return `${chalk.underline(chalk.cyan(missingComponent.id.toString()))}\n${formatMissing(missingComponent)}`;
  }

  const result = `\n${components.map(format).join('\n')}`;
  return result;
}

function formatMissing(missingComponent: Object) {
  function formatMissingStr(array, label) {
    if (!array || array.length === 0) return '';
    return (
      chalk.yellow(`${label}: \n`) +
      chalk.white(
        Object.keys(array)
          .map(key => `     ${key} -> ${array[key].join(', ')}`)
          .join('\n')
      )
    );
  }

  const missingStr = Object.keys(missingDependenciesLabels)
    .map(key => formatMissingStr(missingComponent.missingDependencies[key], missingDependenciesLabels[key]))
    .join('');

  return `${missingStr}\n`;
}
