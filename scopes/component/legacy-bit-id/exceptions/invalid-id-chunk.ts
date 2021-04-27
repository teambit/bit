import { BitError } from '@teambit/bit-error';

export default class InvalidIdChunk extends BitError {
  id: string;

  constructor(id: string) {
    super(
      `error: "${id}" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}
