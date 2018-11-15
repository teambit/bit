import BaseType from './base-type';

export default class Boolean extends BaseType {
  constructor(val) {
    super(val);
    this.name = 'boolean';
  }

  static validate(val): boolean {
    return typeof val === 'boolean';
  }

  static loadFromStore(modelVal): Boolean {
    return new Boolean(modelVal);
  }
}
