import type { Component } from '@teambit/component';
import type { APISchema } from '@teambit/semantics.entities.semantic-schema';
import type { Formatter } from '@teambit/formatter';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component, options?: SchemaExtractorOptions): Promise<APISchema>;
  /**
   * release resources if no schemas are needed for this process.
   * for typescript, this will kill the tsserver process.
   * for performance reasons, this is not automatically run after "extract". otherwise, running extract on multiple
   * components will be very slow.
   */
  dispose(): void;
}

export type SchemaExtractorOptions = {
  formatter?: Formatter;
  tsserverPath?: string;
  contextPath?: string;
  skipInternals?: boolean;
};
