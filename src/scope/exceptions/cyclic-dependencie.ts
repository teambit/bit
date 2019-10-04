import AbstractError from '../../error/abstract-error';

export default class CyclicDependencies extends AbstractError {
  msg: string;
  constructor(msg: string) {
    super();
    this.msg = msg;
  }
}
