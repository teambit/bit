import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component';

export class PreviewOutputFileNotFound extends BitError {
  constructor(componentId: ComponentID, filePath: string) {
    super(`preview output file for component: "${componentId.toString()}" was not found in the path: "${filePath}".

This is usually a result of an error during the bundling process.
The error might be an error of another component that uses the same env.
Run "bit build" with "--dev" to see more info.
Run "bit envs" to see other components that uses the same env`);
  }
}
