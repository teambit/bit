import { PaperError } from '../../cli';

export class InvalidTask extends PaperError {
  constructor(readonly task: any) {
    super(`task is invalid`);
  }

  report() {
    return `task: ${this.task} is invalid`;
  }
}
