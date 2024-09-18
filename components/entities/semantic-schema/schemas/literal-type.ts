import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * e.g. const a: 'a';
 */
export class LiteralTypeSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly name: string) {
    super();
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
    };
  }

  toString() {
    return this.name;
  }

  toFullSignature(): string {
    return this.toString();
  }

  static fromObject(obj: Record<string, any>): LiteralTypeSchema {
    const location = obj.location;
    const name = obj.name;
    return new LiteralTypeSchema(location, name);
  }
}
