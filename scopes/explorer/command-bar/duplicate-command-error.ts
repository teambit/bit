import { BitError } from '@teambit/bit-error';
import { CommandId } from './types';

export class DuplicateCommandError extends BitError {
  constructor(commandId: CommandId) {
    super(`Command "${commandId}" is already added.`);
  }
}
