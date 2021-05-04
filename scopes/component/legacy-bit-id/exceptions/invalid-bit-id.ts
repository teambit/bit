import { BitError } from '@teambit/bit-error';

export default class InvalidBitId extends BitError {
  id: string;

  constructor(id: string) {
    super(`error: component ID "${id}" is invalid, please use the following format: [scope]/<name>`);
  }
}
