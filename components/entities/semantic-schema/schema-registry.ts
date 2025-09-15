import type { SchemaNodeConstructor } from './schema-node-constructor';
import { UnknownSchemaFactory } from './unknown-schema-factory';

type GetSchemaFunc = () => SchemaNodeConstructor[];

export class SchemaRegistry {
  private static instance = new SchemaRegistry();
  private _schemas: Record<string, SchemaNodeConstructor>;
  private _getSchemas: GetSchemaFunc[] = [];

  private constructor() {
    this._schemas = {};
  }

  static registerGetSchemas(getSchemas: GetSchemaFunc) {
    this.instance._getSchemas.push(getSchemas);
  }

  /**
   * @deprecated use registerGetSchemas instead
   * registerGetSchemas is better for performance as it lazy-loads the schemas.
   */
  static register(schema: SchemaNodeConstructor) {
    if (this.instance._schemas[schema.name]) return;
    this.instance._schemas[schema.name] = schema;
  }

  static schemas() {
    // this happens only once. as soon as the function is called, it registers all the schemas.
    this.instance._getSchemas.forEach((getSchemas) => {
      const schemas = getSchemas();
      schemas.forEach((schema) => {
        if (this.instance._schemas[schema.name]) return;
        this.instance._schemas[schema.name] = schema;
      });
    });
    this.instance._getSchemas = [];
    return this.instance._schemas;
  }

  static fromObject(obj: Record<string, any>) {
    if (!obj.__schema) {
      throw new Error(`fatal: "__schema" is missing, make sure the transformer is set on SchemaNode type`);
    }
    const schemas = this.schemas();
    const SchemaClass = schemas[obj.__schema];
    if (!SchemaClass) {
      // for backward and forward compatibility, to not break the users, it's better to return an unknown schema than throwing.
      return UnknownSchemaFactory.create(obj.location || { path: '', line: 0, character: 0 }, obj.__schema, obj);
    }
    return SchemaClass.fromObject(obj);
  }
}
