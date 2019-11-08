import AbstractError from '../../error/abstract-error';

export default class ComponentNeedsUpdate extends AbstractError {
  id: string;
  hash: string;

  constructor(id: string, hash: string) {
    super();
    this.id = id;
    this.hash = hash;
  }
}
