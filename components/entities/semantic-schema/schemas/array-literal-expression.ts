import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ArrayLiteralExpressionSchema extends SchemaNode {
  constructor(readonly members: SchemaNode[], readonly location: SchemaLocation) {
    super();
  }

  toObject() {
    return {
      ...super.toObject(),
      members: this.members.map((member) => member.toObject()),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): ArrayLiteralExpressionSchema {
    const members = obj.members.map((member) => SchemaRegistry.fromObject(member));
    return new ArrayLiteralExpressionSchema(members, obj.location);
  }

  toString(): string {
    return `[${this.members.join(', ')}]`;
  }
}
