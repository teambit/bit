import BaseType from './base-type';

export default class String extends BaseType {
  constructor(val) {
    super(val);
    this.name = 'string';
  }

  static validate(val): boolean {
    return typeof val === 'string';
  }

  static loadFromStore(modelVal): String {
    return new String(modelVal);
  }
}
