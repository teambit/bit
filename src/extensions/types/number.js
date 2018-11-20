// @flow
import BaseType from './base-type';

export default class Number extends BaseType {
  constructor(value: number) {
    super(value);
    this.name = 'number';
  }

  static validate(value: any): boolean {
    return typeof value === 'number';
  }

  static loadFromStore(modelValue: number): Number {
    return new Number(modelValue); // eslint-disable-line no-new-wrappers
  }
}
