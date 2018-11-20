// @flow
import BaseType from './base-type';

export default class String extends BaseType {
  constructor(value: string) {
    super(value);
    this.name = 'string';
  }

  static validate(value: any): boolean {
    return typeof value === 'string';
  }

  static loadFromStore(modelVal: string): String {
    return new String(modelVal); // eslint-disable-line no-new-wrappers
  }
}
