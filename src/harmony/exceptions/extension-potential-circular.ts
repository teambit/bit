import chalk from 'chalk';
import { Extension } from '../extension';
import HarmonyError from './harmony-error';

export default class ExtensionPotentialCircular extends HarmonyError {
  constructor(
    /**
     * failed extension
     */
    private extension: Extension,

    /**
     * valid extensions dependencies names
     */
    private validDeps: string[]
  ) {
    super();
  }

  toString() {
    return `Failed to load the dependencies for extension ${chalk.bold(this.extension.name)}. 
This may result from a wrong import or from circular dependencies in imports. 
The following dependencies succeeded loading: ${chalk.bold(this.validDeps.join(', '))}`;
  }
}
