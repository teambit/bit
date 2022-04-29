import { SchemaNode } from '../schema-node';

export class VariableSchema implements SchemaNode {
  constructor(readonly name: string, private signature: string) {}

  serialize() {}

  toJsonSchema() {}

  getSignature() {
    return this.signature;
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
    };
  }
}
