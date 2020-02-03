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
    return `failed to load extensions' dependencies.
The dependencies for ${chalk.bold(this.extension.name)} are not loaded.
This might be a result of wrong import or a circular dependencies
The following dependencies did loaded correctly: ${chalk.bold(this.validDeps.join(', '))}`;
  }
}
