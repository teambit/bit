import { BitError } from 'bit-bin/dist/error/bit-error';

export class NoTestFilesFound extends BitError {
  constructor(private testRegex: string) {
    super();
  }

  report() {
    return `no test files for regex: '${this.testRegex}' found for any of the components in the workspace.`;
  }
}
