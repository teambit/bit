import type { PluginDefinition } from '@teambit/aspect-loader';
import type { SchemaTransformerSlot } from './typescript.main.runtime';

export class SchemaTransformerPlugin implements PluginDefinition {
  constructor(private schemaTransformerSlot: SchemaTransformerSlot) {}

  pattern = '*.schema-extractor.*';

  runtimes = ['main'];

  register(object: any) {
    return this.schemaTransformerSlot.register(() => [object]);
  }
}
