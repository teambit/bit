import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';

export class UnImplementedSchema extends SchemaNode {
  readonly displaySchemaName = 'Unimplemented Schemas';

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly type: string
  ) {
    super();
  }

  toString() {
    return `<<unimplemented schema ${this.name} of type ${this.type}>>`;
  }

  toFullSignature(): string {
    return `<<unimplemented schema ${this.name} of type ${this.type}>>`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type,
    };
  }

  static fromObject(obj: Record<string, any>): UnImplementedSchema {
    const location = obj.location;
    const name = obj.name;
    const type = obj.type;
    return new UnImplementedSchema(location, name, type);
  }
}
