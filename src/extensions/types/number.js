import BaseType from './base-type';

export default class Number extends BaseType {
  constructor(value) {
    super(value);
    this.name = 'number';
  }

  static validate(value): boolean {
    return typeof value === 'number';
  }

  static loadFromStore(modelValue): Number {
    return new Number(modelValue);
  }
}
