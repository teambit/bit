import { BitError } from '@teambit/bit-error';

export default class InvalidName extends BitError {
  componentName: string;

  constructor(componentName: string) {
    super(
      `error: "${componentName}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]`
    );
  }
}
