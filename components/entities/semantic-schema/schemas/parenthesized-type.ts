import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

/**
 * type inside parentheses
 * e.g. (T1 | T2)
 */
export class ParenthesizedTypeSchema extends SchemaNode {
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

  toString(options?: { color?: boolean }): string {
    return `(${this.type.toString(options)})`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    return `(${this.type.toFullSignature(options)})`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): ParenthesizedTypeSchema {
    const location = obj.location;
    const type = SchemaRegistry.fromObject(obj.type);
    return new ParenthesizedTypeSchema(location, type);
  }
}
