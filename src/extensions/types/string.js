// @flow
import BaseType from './base-type';

export default class String extends BaseType {
  constructor() {
    super();
    this.name = 'string';
  }

  validate(value: any): boolean {
    return typeof value === 'string';
  }
}
