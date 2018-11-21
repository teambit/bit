// @flow
import BaseType from './base-type';

export default class ArrayOf extends BaseType {
  type: BaseType;
  constructor(type: BaseType) {
    super();
    this.name = `array<${type.name}>`;
    this.type = type;
  }

  validate(value: any): boolean {
    if (!Array.isArray(value)) return false;
    return value.every(item => this.type.validate(item));
  }
}
