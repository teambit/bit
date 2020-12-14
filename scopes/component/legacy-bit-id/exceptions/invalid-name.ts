import AbstractError from '../../error/abstract-error';

export default class InvalidName extends AbstractError {
  componentName: string;

  constructor(componentName: string) {
    super();
    this.componentName = componentName;
  }
}
