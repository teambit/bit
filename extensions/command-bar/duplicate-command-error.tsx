import { BitError } from 'bit-bin/dist/error/bit-error';
import { CommandId } from './types';

export class DuplicateCommandError extends BitError {
  constructor(commandId: CommandId) {
    super(`Command "${commandId}" is already added.`);
  }

  isUserError = true;

  report(): string {
    return this.message;
  }
}
