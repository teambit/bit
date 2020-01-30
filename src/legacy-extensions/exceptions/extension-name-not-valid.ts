import AbstractError from '../../error/abstract-error';

export default class ExtensionNameNotValid extends AbstractError {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
}
