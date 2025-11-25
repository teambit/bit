import { BitError } from '@teambit/bit-error';

export default class FileSourceNotFound extends BitError {
  path: string;

  constructor(path: string) {
    super(`file or directory "${path}" was not found`);
    this.path = path;
  }
}
