import { BitError } from '@teambit/bit-error';

export class OutsideWorkspaceError extends BitError {
  constructor() {
    super(
      `This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)`
    );
  }
}
