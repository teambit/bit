import { BitError } from '@teambit/bit-error';

export class AddingIndividualFiles extends BitError {
  file: string;
  constructor(file: string) {
    super(`error: adding individual files is blocked ("${file}"), and only directories can be added`);
    this.file = file;
  }
}
