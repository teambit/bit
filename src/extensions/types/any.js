// @flow
import BaseType from './base-type';

export default class Any extends BaseType {
  constructor(value: any) {
    super(value);
    this.name = 'any';
  }

  static validate(): boolean {
    return true;
  }

  static loadFromStore(modelValue: any): Any {
    return new Any(modelValue);
  }
}
