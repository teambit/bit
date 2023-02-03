import { Extension } from '../extension/extension';
import { HarmonyError } from './harmony-error';

export default class ExtensionPotentialCircular extends HarmonyError {
  constructor(
    /**
     * failed extension
     */
    private extension: Extension,

    /**
     * valid extensions dependencies
     */
    private validDeps: Extension[]
  ) {
    super();
  }

  toString() {
    return `Failed to load the dependencies for extension . 
This may result from a wrong import or from circular dependencies in imports. 
The following dependencies succeeded loading:`;
  }
}
