import type { DocSchema } from '..';
import { SchemaRegistry } from '..';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';

export class IgnoredSchema extends SchemaNode {
  public location: SchemaLocation;
  public doc?: DocSchema;
  public name?: string;

  constructor(public readonly node: SchemaNode) {
    super();
    this.location = node.location;
    this.doc = node.doc;
    this.name = node.name;
  }

  getNodes() {
    return [];
  }

  getAllNodesRecursively(): SchemaNode[] {
    return [];
  }

  toString() {
    return '';
  }

  toFullSignature(): string {
    return '';
  }

  toObject() {
    return {
      ...super.toObject(),
      node: this.node.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): IgnoredSchema {
    const node = SchemaRegistry.fromObject(obj.node);
    return new IgnoredSchema(node);
  }
}
