import { BitError } from '@teambit/bit-error';

export class YargsExitWorkaround extends BitError {
  constructor(
    public exitCode: number,
    public helpMsg: string
  ) {
    super('Workaround for yargs exit issue');
  }
}
