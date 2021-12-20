import { Component } from '@teambit/component';
import { SemanticSchema } from '@teambit/semantics.entities.semantic-schema';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component): Promise<SemanticSchema>;
}
