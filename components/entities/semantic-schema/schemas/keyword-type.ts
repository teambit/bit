import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * e.g. 'string', 'boolean', etc.
 */
export class KeywordTypeSchema extends SchemaNode {
  constructor(
    readonly location: SchemaLocation,
    readonly name: string
  ) {
    super();
  }

  toString() {
    return this.name;
  }

  toFullSignature(): string {
    return this.toString();
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
    };
  }

  static fromObject(obj: Record<string, any>): KeywordTypeSchema {
    const location = obj.location;
    const name = obj.name;
    return new KeywordTypeSchema(location, name);
  }
}
