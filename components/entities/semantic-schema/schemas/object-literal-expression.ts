import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SchemaLocation } from '../schema-node';

interface ObjectLiteralProperty {
  key: string;
  value: any;
}

export class ObjectLiteralExpressionSchema extends SchemaNode {
  constructor(readonly properties: ObjectLiteralProperty[], readonly location: SchemaLocation) {
    super();
  }

  toObject() {
    return {
      type: 'ObjectLiteralExpression',
      properties: this.properties.map(({ key, value }) => ({ key, value })),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): ObjectLiteralExpressionSchema {
    const properties = obj.properties.map(({ key, value }) => ({ key, value }));
    const location = obj.location;
    return new ObjectLiteralExpressionSchema(properties, location);
  }

  toString(): string {
    return `ObjectLiteralExpression`;
  }
}
