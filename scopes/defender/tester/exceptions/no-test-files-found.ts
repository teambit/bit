import { BitError } from '@teambit/bit-error';

export class NoTestFilesFound extends BitError {
  constructor(testRegex: string) {
    super(`no test files for regex: '${testRegex}' found for any of the components in the workspace.`);
  }
}
