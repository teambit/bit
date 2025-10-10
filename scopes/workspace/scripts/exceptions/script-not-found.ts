import { BitError } from '@teambit/bit-error';

export class ScriptNotFound extends BitError {
  constructor(
    readonly scriptName: string,
    readonly envId: string
  ) {
    super(`script "${scriptName}" was not found in environment "${envId}"`);
  }
}
