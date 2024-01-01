import { SchemaLocation, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';

export class EnumMemberSchema extends SchemaNode {
  readonly doc?: DocSchema;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly signature: string,
    readonly value?: string,
    doc?: DocSchema
  ) {
    super();
    this.doc = doc;
  }

  toString() {
    if (!this.value) return this.name;
    return `${this.name}=${this.value}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      signature: this.signature,
      value: this.value,
      doc: this.doc?.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): EnumMemberSchema {
    const location = obj.location;
    const name = obj.name;
    const signature = obj.signature;
    const value = obj.value;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new EnumMemberSchema(location, name, signature, value, doc);
  }
}
