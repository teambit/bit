import { PaperError } from './paper-error';

export class AlreadyExistsError extends PaperError {
  constructor(type: string, name: string) {
    super(`${type} ${name} already exists.`);
  }
  report() {
    return this.message;
  }
}
