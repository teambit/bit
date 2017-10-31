// @flow
import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';

export const missingDependenciesLabels = {
  untrackedDependencies: 'untracked file dependencies',
  missingPackagesDependenciesOnFs: 'missing packages dependencies',
  missingLinks: 'missing bind links',
  relativeComponents: 'relative components (should be absolute)',
  missingDependenciesOnFs: 'non-existing dependency files'
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
    return chalk.yellow(`${label}: `) + chalk.white(array.join(', '));
  }

  const missingStr = Object.keys(missingDependenciesLabels)
    .map(key => formatMissingStr(missingComponent.missingDependencies[key], missingDependenciesLabels[key]))
    .join('');

  return `${missingStr}\n`;
}
