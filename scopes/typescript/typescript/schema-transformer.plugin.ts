import { PluginDefinition } from '@teambit/aspect-loader';
import { SchemaTransformerSlot } from './typescript.main.runtime';

export class SchemaTransformerPlugin implements PluginDefinition {
  constructor(private schemaTransformerSlot: SchemaTransformerSlot) {}

  pattern = '*.schema-extractor.*';

  runtimes = ['main'];

  async register(object: any) {
    return this.schemaTransformerSlot.register([object]);
  }
}
