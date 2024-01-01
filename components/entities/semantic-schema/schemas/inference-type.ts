import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * where there is no explicit type, the type is taken from the "quickinfo" of tsserver
 */
export class InferenceTypeSchema extends SchemaNode {
  constructor(
    readonly location: SchemaLocation,
    readonly type: string,
    readonly name?: string,
    readonly defaultValue?: string,
    readonly isSpread?: boolean
  ) {
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
      type: this.type,
      defaultValue: this.defaultValue,
      isSpread: this.isSpread,
    };
  }

  static fromObject(obj: Record<string, any>): InferenceTypeSchema {
    const location = obj.location;
    const type = obj.type;
    const name = obj.name;
    const defaultValue = obj.defaultValue;
    const isSpread = obj.isSpread;
    return new InferenceTypeSchema(location, type, name, defaultValue, isSpread);
  }
}
