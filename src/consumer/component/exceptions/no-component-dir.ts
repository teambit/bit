import AbstractError from '../../../error/abstract-error';

export class NoComponentDir extends AbstractError {
  id: string;
  constructor(id: string) {
    super();
    this.id = id;
  }
}
