import { SchemaNode, SchemaRegistry } from '@teambit/semantics.entities.semantic-schema';
import { SchemaLocation } from '../schema-node';

export class ObjectLiteralExpressionSchema extends SchemaNode {
  constructor(readonly members: SchemaNode[], readonly location: SchemaLocation) {
    super();
  }

  toString(): string {
    return this.members.map((member) => member.toString()).join('\n');
  }

  toObject() {
    return {
      ...super.toObject(),
      members: this.members.map((element) => element.toObject()),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): ObjectLiteralExpressionSchema {
    const members = obj.members.map((member) => SchemaRegistry.fromObject(member));
    const location = obj.location;
    return new ObjectLiteralExpressionSchema(members, location);
  }
}
