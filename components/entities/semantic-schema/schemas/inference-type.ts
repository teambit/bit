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
    readonly isSpread?: boolean,
    readonly alias?: string
  ) {
    super();
  }

  toString() {
    if (this.name && this.name !== this.type) {
      return `${this.name}: ${this.type}`;
    }
    return this.type;
  }

  toFullSignature(): string {
    let result = '';

    if (this.name && this.name !== this.type) {
      result += `${this.name}: `;
    }

    result += this.type;

    if (this.defaultValue !== undefined) {
      result += ` = ${this.defaultValue}`;
    }

    return result;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type,
      defaultValue: this.defaultValue,
      isSpread: this.isSpread,
      alias: this.alias,
    };
  }

  static fromObject(obj: Record<string, any>): InferenceTypeSchema {
    const location = obj.location;
    const type = obj.type;
    const name = obj.name;
    const defaultValue = obj.defaultValue;
    const isSpread = obj.isSpread;
    const alias = obj.alias;
    return new InferenceTypeSchema(location, type, name, defaultValue, isSpread, alias);
  }
}
