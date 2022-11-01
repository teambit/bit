import { Component } from '@teambit/component';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component): Promise<APISchema>;

  /**
   * release resources if no schemas are needed for this process.
   * for typescript, this will kill the tsserver process.
   * for performance reasons, this is not automatically run after "extract". otherwise, running extract on multiple
   * components will be very slow.
   */
  dispose(): void;
}
