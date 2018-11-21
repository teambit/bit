// @flow
import BaseType from './base-type';

export default class Number extends BaseType {
  constructor() {
    super();
    this.name = 'number';
  }

  validate(value: any): boolean {
    return typeof value === 'number';
  }
}
