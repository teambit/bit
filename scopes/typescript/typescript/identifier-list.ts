import { Identifier } from './identifier';

export class IdentifierList {
  constructor(readonly identifiers: Identifier[]) {}

  find(identifier: Identifier) {
    const result = this.identifiers.find((_identifier) => _identifier.isEqual(identifier));
    return result;
  }

  includes(identifier: Identifier) {
    return Boolean(this.find(identifier));
  }
}
