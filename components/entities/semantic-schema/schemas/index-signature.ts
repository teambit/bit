import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { ParameterSchema } from './parameter';

/**
 * [key: number]: string
 * keyType: number
 * valueType: string
 */
export class IndexSignatureSchema extends SchemaNode {
  readonly keyType: SchemaNode;
  readonly valueType: SchemaNode;
  constructor(readonly location: SchemaLocation, keyType: ParameterSchema, valueType: SchemaNode) {
    super();
    this.keyType = keyType;
    this.valueType = valueType;
  }

  toString() {
    return `[${this.keyType.toString()}]: ${this.valueType.toString()}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const keyTypeStr = this.keyType.toFullSignature(options);
    const valueTypeStr = this.valueType.toFullSignature(options);

    return `[${keyTypeStr}]: ${valueTypeStr}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      location: this.location,
      keyType: this.keyType.toObject(),
      valueType: this.valueType.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): IndexSignatureSchema {
    const location = obj.location;
    const keyType = ParameterSchema.fromObject(obj.keyType);
    const valueType = SchemaRegistry.fromObject(obj.valueType);
    return new IndexSignatureSchema(location, keyType, valueType);
  }
}
