// @flow
import chalk from 'chalk';
import type { EjectResults } from '../../consumer/component-ops/eject-components';

export const successEjectMessage = 'successfully ejected the following components';
export const failureEjectMessage = 'failed to eject the following components';

export default function ejectTemplate(ejectResults: EjectResults): string {
  const getEjectedOutput = () => {
    if (!ejectResults.ejectedComponents.length) return '';
    return chalk.green(`${successEjectMessage} ${chalk.bold(ejectResults.ejectedComponents.toString())}\n`);
  };
  const getFailureOutput = () => {
    const failures = ejectResults.failedComponents;
    const title = chalk.red(`${failureEjectMessage}\n`);
    const modified = failures.modifiedComponents.length
      ? `components with local modification (use --force to ignore): ${failures.modifiedComponents.toString()}\n`
      : '';
    const staged = failures.stagedComponents.length
      ? `components with local versions (use --force to ignore): ${failures.stagedComponents.toString()}\n`
      : '';
    const notExported = failures.notExportedComponents.length
      ? `local components that were not exported yet: ${failures.notExportedComponents.toString()}\n`
      : '';
    const selfHosted = failures.selfHostedExportedComponents.length
      ? `components that were exported to a self hosted scope (not bitsrc): ${failures.selfHostedExportedComponents.toString()}\n`
      : '';
    const body = modified + staged + notExported + selfHosted;
    if (body) return chalk.underline(title) + chalk.red(body);
    return '';
  };
  return getEjectedOutput() + getFailureOutput();
}
