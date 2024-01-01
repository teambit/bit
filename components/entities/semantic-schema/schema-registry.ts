import { SchemaNodeConstructor } from './schema-node-constructor';
import { UnknownSchemaFactory } from './unknown-schema-factory';

export class SchemaRegistry {
  private static instance = new SchemaRegistry();
  private _schemas: Record<string, SchemaNodeConstructor>;

  private constructor() {
    this._schemas = {};
  }

  static register(schema: SchemaNodeConstructor) {
    if (this.instance._schemas[schema.name]) return;
    this.instance._schemas[schema.name] = schema;
  }

  static schemas() {
    return this.instance._schemas;
  }

  static fromObject(obj: Record<string, any>) {
    if (!obj.__schema) {
      throw new Error(`fatal: "__schema" is missing, make sure the transformer is set on SchemaNode type`);
    }

    const SchemaClass = this.instance._schemas[obj.__schema];
    if (!SchemaClass) {
      // for backward and forward compatibility, to not break the users, it's better to return an unknown schema than throwing.
      return UnknownSchemaFactory.create(obj.location || { path: '', line: 0, character: 0 }, obj.__schema, obj);
    }
    return SchemaClass.fromObject(obj);
  }
}
