import { SchemaLocation } from './schema-node';

export class UnknownSchemaFactory {
  static create(location: SchemaLocation, name: string, schemaObj: Record<string, any>): any {
    // dynamic require() to import UnknownSchema at runtime when it's needed, which breaks the circular dependency.
    // eslint-disable-next-line global-require
    const { UnknownSchema } = require('./schemas/unknown-schema');
    return new UnknownSchema(location, name, schemaObj);
  }
}
