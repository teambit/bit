// @flow
import BaseType from './base-type';

export default class Any extends BaseType {
  constructor() {
    super();
    this.name = 'any';
  }

  validate(): boolean {
    return true;
  }
}
