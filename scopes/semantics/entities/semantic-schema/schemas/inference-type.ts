import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly type: string, readonly name?: string) {
    super();
  }

  toString() {
    if (this.name && this.name !== this.type) {
      return `${this.name}: ${this.type}`;
    }
    return this.type;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type,
    };
  }

  static fromObject(obj: Record<string, any>): InferenceTypeSchema {
    const location = obj.location;
    const type = obj.type;
    const name = obj.name;
    return new InferenceTypeSchema(location, type, name);
  }
}
