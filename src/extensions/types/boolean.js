// @flow
import BaseType from './base-type';

export default class Boolean extends BaseType {
  constructor(value: boolean) {
    super(value);
    this.name = 'boolean';
  }

  static validate(value: any): boolean {
    return typeof value === 'boolean';
  }

  static loadFromStore(modelVal: boolean): Boolean {
    return new Boolean(modelVal); // eslint-disable-line no-new-wrappers
  }
}
