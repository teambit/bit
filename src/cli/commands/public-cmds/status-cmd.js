/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import type { StatusResult } from '../../../api/consumer/lib/status';
import Component from '../../../consumer/component';
import { immutableUnshift, isString } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import { missingDependenciesLabels } from '../../templates/missing-dependencies-template';

export default class Status extends Command {
  name = 'status';
  description = 'show the working area component(s) status.';
  alias = 's';
  opts = [];
  loader = true;

  action(): Promise<Object> {
    return status();
  }

  report({
    newComponents,
    modifiedComponent,
    stagedComponents,
    componentsWithMissingDeps,
    importPendingComponents,
    autoTagPendingComponents
  }: StatusResult): string {
    function formatMissing(missingComponent: Component) {
      function formatMissingStr(array, label) {
        if (!array || array.length === 0) return '';
        return chalk.yellow(`\n       ${label}: `) + chalk.white(array.join(', '));
      }

      const missingStr = Object.keys(missingDependenciesLabels)
        .map(key => formatMissingStr(missingComponent.missingDependencies[key], missingDependenciesLabels[key]))
        .join('');

      return `       ${missingStr}\n`;
    }

    function format(component: string | Component): string {
      const missing = componentsWithMissingDeps.find((missingComp: Component) => {
        const compId = component.id ? component.id.toString() : component;
        return missingComp.id.toString() === compId;
      });

      // @TODO component must not be a string
      if (isString(component)) return `${formatBitString(component)}... ${chalk.green('ok')}`;
      if (!missing) return `${formatNewBit(component)}... ${chalk.green('ok')}`;
      return `${formatNewBit(component)}... ${chalk.red('missing dependencies')}${formatMissing(missing)}`;
    }

    const importPendingWarning = importPendingComponents.length
      ? chalk.yellow('Some of your components are not imported yet, please run "bit import" to import them\n\n')
      : '';

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

    const autoTagPendingOutput = immutableUnshift(
      autoTagPendingComponents.map(format),
      autoTagPendingComponents.length
        ? chalk.underline.white('components pending to be tagged automatically (when their dependencies are tagged)')
        : chalk.green('no auto-tag pending components')
    ).join('\n');

    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map(format),
      stagedComponents.length ? chalk.underline.white('staged components') : chalk.green('no staged components')
    ).join('\n');

    return (
      importPendingWarning +
      [newComponentsOutput, modifiedComponentOutput, stagedComponentsOutput, autoTagPendingOutput].join(
        chalk.underline('\n                         \n') + chalk.white('\n')
      )
    );
  }
}
