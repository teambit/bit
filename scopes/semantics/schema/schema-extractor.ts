import { Component } from '@teambit/component';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { Formatter } from '@teambit/formatter';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component, formatter: Formatter): Promise<APISchema>;
}
