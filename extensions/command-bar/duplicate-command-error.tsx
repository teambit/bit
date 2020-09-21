import { BitError } from 'bit-bin/dist/error/bit-error';
import { CommandId } from './types';

export class DuplicateCommandError extends BitError {
  constructor(private commandId: CommandId) {
    super();
  }

  isUserError = true;

  report(): string {
    return `Failed registering command, because it already exists: "${this.commandId}"`;
  }
}
