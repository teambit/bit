import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TypeArraySchema extends SchemaNode {
  readonly type: SchemaNode;

  constructor(
    readonly location: SchemaLocation,
    type: SchemaNode
  ) {
    super();
    this.type = type;
  }

  getNodes() {
    return [this.type];
  }

  toString(options?: { color?: boolean }) {
    return `${this.type.toString(options)}[]`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    return `${this.type.toFullSignature(options)}[]`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): TypeArraySchema {
    const location = obj.location;
    const type = SchemaRegistry.fromObject(obj.type);
    return new TypeArraySchema(location, type);
  }
}
