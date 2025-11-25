import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

/**
 * e.g. `typeof Foo`
 */
export class TypeQuerySchema extends SchemaNode {
  readonly type: SchemaNode;

  constructor(
    readonly location: SchemaLocation,
    type: SchemaNode,
    readonly signature: string
  ) {
    super();
    this.type = type;
  }

  getNodes() {
    return [this.type];
  }

  getSignature() {
    return this.signature;
  }

  toString(options?: { color?: boolean }) {
    return `typeof ${this.type.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    return `typeof ${this.type.toFullSignature(options)}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type.toObject(),
      signature: this.signature,
    };
  }

  static fromObject(obj: Record<string, any>): TypeQuerySchema {
    const location = obj.location;
    const type = SchemaRegistry.fromObject(obj.type);
    const signature = obj.signature;
    return new TypeQuerySchema(location, type, signature);
  }
}
