import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

/**
 * e.g. `{ a: string; b: number }`
 */
export class TypeLiteralSchema extends SchemaNode {
  readonly members: SchemaNode[];

  constructor(readonly location: SchemaLocation, members: SchemaNode[]) {
    super();
    this.members = members;
  }

  getNodes() {
    return this.members;
  }

  toString() {
    return `{ ${this.members.map((type) => type.toString()).join('; ')} }`;
  }

  toObject() {
    return {
      ...super.toObject(),
      members: this.members.map((type) => type.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): TypeLiteralSchema {
    const location = obj.location;
    const members = obj.members.map((type: any) => SchemaRegistry.fromObject(type));
    return new TypeLiteralSchema(location, members);
  }
}
