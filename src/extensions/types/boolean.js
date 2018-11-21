// @flow
import BaseType from './base-type';

export default class Boolean extends BaseType {
  constructor() {
    super();
    this.name = 'boolean';
  }

  validate(value: any): boolean {
    return typeof value === 'boolean';
  }
}
