import AbstractError from '../../../../error/abstract-error';

export default class FlagHarmonyOnly extends AbstractError {
  flag: string;

  constructor(flag: string) {
    super();
    this.flag = flag;
  }
}
