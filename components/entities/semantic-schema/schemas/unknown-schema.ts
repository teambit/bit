import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';

/**
 * needed for better backward and forward compatibility.
 * in case a previous version of the semantic-schema had a schema class that doesn't exist anymore, then it'll be
 * wrapped in this class.
 */
export class UnknownSchema extends SchemaNode {
  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly schemaObj: Record<string, any>
  ) {
    super();
  }

  toString() {
    return `<<unknown schema ${this.name}>>`;
  }

  toFullSignature(): string {
    return this.toString();
  }

  toObject() {
    return {
      ...super.toObject(),
      schemaObj: this.schemaObj,
    };
  }

  static fromObject(obj: Record<string, any>): UnknownSchema {
    const location = obj.location;
    const name = obj.name;
    const schemaObj = obj.schemaObj;
    return new UnknownSchema(location, name, schemaObj);
  }
}
