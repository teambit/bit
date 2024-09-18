import { SchemaLocation, SchemaNode } from '../schema-node';

export class UnImplementedSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly name: string, readonly type: string) {
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
