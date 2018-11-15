import BaseType from './base-type';

export default class Number extends BaseType {
  constructor(val) {
    super(val);
    this.name = 'number';
  }

  static validate(val): boolean {
    return typeof val === 'number';
  }

  static loadFromStore(modelVal): Number {
    return new Number(modelVal);
  }
}
