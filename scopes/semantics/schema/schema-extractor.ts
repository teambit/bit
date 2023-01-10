import { Component } from '@teambit/component';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { Formatter } from '@teambit/formatter';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component, formatter?: Formatter): Promise<APISchema>;
  /**
   * release resources if no schemas are needed for this process.
   * for typescript, this will kill the tsserver process.
   * for performance reasons, this is not automatically run after "extract". otherwise, running extract on multiple
   * components will be very slow.
   */
  dispose(): void;
}
