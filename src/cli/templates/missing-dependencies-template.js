// @flow
import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';

export default function missingDepsTemplate(components: ConsumerComponent[]) {
  function format(missingComponent) {
    return chalk.underline(chalk.cyan(missingComponent.id.toString())) + '\n' + formatMissing(missingComponent);
  }

  const result = '\n' + components.map(format).join('\n');
  return result;
}

function formatMissing(missingComponent) {
  function formatMissingStr(array, label) {
    if (!array || array.length === 0) return '';
    return chalk.yellow(`${label}: `) + chalk.white(array.join(', '));
  }

  return formatMissingStr(missingComponent.missingDependencies.untrackedDependencies, 'untracked file dependencies') +
    formatMissingStr(missingComponent.missingDependencies.missingPackagesDependenciesOnFs, 'missing packages dependencies') +
    formatMissingStr(missingComponent.missingDependencies.missingDependenciesOnFs, 'non-existing dependency files') + 
    '\n';
}
