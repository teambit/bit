/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import { immutableUnshift, forEach } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import missingDepsTemplate from '../../templates/missing-dependencies-template';


export default class Status extends Command {
  name = 'status';
  description = 'show the working area component(s) status.';
  alias = 's';
  opts = [];
  loader = true;

  action(): Promise<Object> {
    return status();
  }

  report({ newComponents, modifiedComponent, stagedComponents, componentsWithMissingDeps }: Object): string {
    function formatMissing(missingComponent) {
      function formatMissingStr(array, label) {
        if (!array || array.length === 0) return '';
        return chalk.yellow(`\n       ${label}: `) + chalk.white(array.join(', '));
      }

      return '       '  +
        formatMissingStr(missingComponent.missingDependencies.untrackedDependencies, 'untracked file dependencies') +
        formatMissingStr(missingComponent.missingDependencies.missingPackagesDependenciesOnFs, 'missing packages dependencies') +
        formatMissingStr(missingComponent.missingDependencies.missingDependenciesOnFs, 'non-existing dependency files') + 
        '\n';
    }

    function format(component) {
      const missing = componentsWithMissingDeps.find((missingComp) => {
        return missingComp.id.toString() === component.id.toString();
      });

      if (!missing) return formatNewBit(component) + '... ' + chalk.green('ok');
      return formatNewBit(component) + '... ' + chalk.red('missing dependencies') + formatMissing(missing);
    }

    const newComponentsOutput = immutableUnshift(
      newComponents.map(format).sort((itemA) => {
        if (itemA.indexOf('ok') !== -1) return -1;
        return 1;
      }),
      newComponents.length ? chalk.underline.white('new components') : chalk.green('no new components')
    ).join('\n');

    const modifiedComponentOutput = immutableUnshift(
      modifiedComponent.map(format),
      modifiedComponent.length ? chalk.underline.white('modified components') : chalk.green('no modified components')
    ).join('\n');

    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map(format),
      stagedComponents.length ? chalk.underline.white('staged components') : chalk.green('no staged components')
    ).join('\n');

    return [newComponentsOutput, modifiedComponentOutput, stagedComponentsOutput].join(
      chalk.underline('\n                         \n')
    + chalk.white('\n'));
  }
}
