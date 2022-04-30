import { SchemaNode } from '../schema-node';
import { TypeRefSchema } from './type-ref';

export class VariableSchema implements SchemaNode {
  constructor(readonly name: string, private signature: string, private type: TypeRefSchema) {}
  getSignature() {
    return this.signature;
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
    };
  }
}
