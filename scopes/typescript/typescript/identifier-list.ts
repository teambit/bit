import { Identifier } from './identifier';

export class IdentifierList {
  constructor(readonly identifiers: Identifier[]) {}

  find(identifier: Identifier) {
    return this.identifiers.find((_identifier) => _identifier.isEqual(identifier));
  }

  includes(identifier: Identifier) {
    return Boolean(this.identifiers.find((_identifier) => _identifier.isEqual(identifier)));
  }
}
