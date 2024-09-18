import { SchemaLocation, SchemaNode } from '../schema-node';

export class LiteralValueSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly value: string) {
    super();
    this.value = this.value.replace(/^['"]|['"]$/g, '');
  }

  toString() {
    return this.value;
  }

  toFullSignature(): string {
    return this.toString();
  }

  toObject() {
    return {
      ...super.toObject(),
      value: this.value,
    };
  }

  static fromObject(obj: Record<string, any>): LiteralValueSchema {
    const location = obj.location;
    const value = obj.value;
    return new LiteralValueSchema(location, value);
  }
}
