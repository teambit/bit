import { BitError } from '@teambit/bit-error';

export class WorkspacePathExists extends BitError {
  constructor(readonly path: string) {
    super(`unable to create a workspace at "${path}", this path already exists`);
  }
}
