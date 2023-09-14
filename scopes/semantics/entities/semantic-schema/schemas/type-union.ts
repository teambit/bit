import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TypeUnionSchema extends SchemaNode {
  readonly types: SchemaNode[];
  constructor(readonly location: SchemaLocation, types: SchemaNode[]) {
    super();
    this.types = types;
  }
  toString() {
    return `${this.types.map((type) => type.toString()).join(' | ')}`;
  }
  getNodes() {
    return this.types;
  }
  toObject() {
    return {
      ...super.toObject(),
      types: this.types.map((type) => type.toObject()),
    };
  }
  static fromObject(obj: Record<string, any>): TypeUnionSchema {
    const location = obj.location;
    const types = obj.types.map((type: any) => SchemaRegistry.fromObject(type));
    return new TypeUnionSchema(location, types);
  }
}
