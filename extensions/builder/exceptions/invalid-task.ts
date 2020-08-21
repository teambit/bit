import { BitError } from 'bit-bin/dist/error/bit-error';

export class InvalidTask extends BitError {
  constructor(readonly task: any) {
    super(`task is invalid`);
  }

  report() {
    return `task: ${this.task} is invalid`;
  }
}
