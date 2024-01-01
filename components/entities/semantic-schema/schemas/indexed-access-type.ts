import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class IndexedAccessSchema extends SchemaNode {
  readonly objectType: SchemaNode;
  readonly indexType: SchemaNode;

  constructor(readonly location: SchemaLocation, objectType: SchemaNode, indexType: SchemaNode) {
    super();
    this.objectType = objectType;
    this.indexType = indexType;
  }

  getNodes() {
    return [this.objectType, this.indexType];
  }

  toString() {
    return `${this.objectType.toString()}[${this.indexType.toString()}]`;
  }

  toObject() {
    return {
      ...super.toObject(),
      objectType: this.objectType.toObject(),
      indexType: this.indexType.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): IndexedAccessSchema {
    const location = obj.location;
    const objectType = SchemaRegistry.fromObject(obj.objectType);
    const indexType = SchemaRegistry.fromObject(obj.indexType);
    return new IndexedAccessSchema(location, objectType, indexType);
  }
}
