import { BitError } from '@teambit/bit-error';

export default class InvalidScopeName extends BitError {
  scopeName: string;
  id: string;

  constructor(scopeName: string, id?: string, variant?: string) {
    const variantStr = variant ? `configured in variant "${variant}" ` : '';
    super(
      `error: "${
        id || scopeName
      }" ${variantStr}is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}
