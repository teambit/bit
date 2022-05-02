import { SchemaNode } from '../schema-node';

export class TypeSchema implements SchemaNode {
  constructor(private name: string, private signature: string) {}
  toObject(): Record<string, any> {
    return {
      name: this.name,
      signature: this.signature,
    };
  }
}
