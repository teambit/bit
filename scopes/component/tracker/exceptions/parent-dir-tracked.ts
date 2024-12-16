import { BitError } from '@teambit/bit-error';

export class ParentDirTracked extends BitError {
  constructor(parentDir: string, componentId: string, currentDir: string) {
    // TODO @david: separate error outputs for `bit create` and `bit add`
    super(`components can't be nested under other components. unable to create a component in directory "${currentDir}" which is nested to component "${componentId}".
using 'bit create', choose a different path for with the '--path' or if using 'bit add' put the component in a different directory"`);
  }
}
