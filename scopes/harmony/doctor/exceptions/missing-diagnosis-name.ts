import { BitError } from '@teambit/bit-error';

export class MissingDiagnosisName extends BitError {
  constructor() {
    super('error: please provide a diagnosis name');
  }
}
