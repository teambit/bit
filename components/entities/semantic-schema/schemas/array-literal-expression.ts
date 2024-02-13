import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SchemaLocation } from '../schema-node';

export class ArrayLiteralExpressionSchema extends SchemaNode {
  constructor(readonly members: SchemaNode[], readonly location: SchemaLocation) {
    super();
  }

  toObject() {
    return {
      ...super.toObject(),
      members: this.members.map((element) => element.toObject()),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): ArrayLiteralExpressionSchema {
    return new ArrayLiteralExpressionSchema(obj.members, obj.location);
  }

  toString(): string {
    return `[${this.members.join(', ')}]`;
  }
}
