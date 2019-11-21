import AbstractError from '../../../../error/abstract-error';

export default class MissingComponentIdForImportedComponent extends AbstractError {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}
