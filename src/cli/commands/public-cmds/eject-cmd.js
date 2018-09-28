/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { ejectAction } from '../../../api/consumer';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';

export const successEjectMessage = 'successfully ejected the following components';
export const failureEjectMessage = 'failed to eject the following components';

export default class Eject extends Command {
  name = 'eject <id...>';
  description = 'remove components from the local scope and install them by the NPM client';
  alias = 'E';
  opts = [['f', 'force', 'ignore local version. remove the components even when they are staged or modified']];
  loader = true;
  migration = true;

  action([ids]: [string[]], { force }: { force: boolean }): Promise<EjectResults> {
    return ejectAction(ids, force);
  }

  report(ejectResults: EjectResults): string {
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
      const body = modified + staged + notExported;
      if (body) return chalk.underline(title) + chalk.red(body);
      return '';
    };
    return getEjectedOutput() + getFailureOutput();
  }
}
