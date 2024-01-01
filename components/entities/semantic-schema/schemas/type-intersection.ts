import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TypeIntersectionSchema extends SchemaNode {
  readonly types: SchemaNode[];

  constructor(readonly location: SchemaLocation, types: SchemaNode[]) {
    super();
    this.types = types;
  }

  getNodes() {
    return this.types;
  }

  toString() {
    return `${this.types.map((type) => type.toString()).join(' & ')}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      types: this.types.map((type) => type.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): TypeIntersectionSchema {
    const location = obj.location;
    const types = obj.types.map((type: any) => SchemaRegistry.fromObject(type));
    return new TypeIntersectionSchema(location, types);
  }
}
