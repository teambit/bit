import type { Component } from '@teambit/component';
import type { APISchema } from '@teambit/semantics.entities.semantic-schema';

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

/**
 * the part of the formatter the extractor needs (formats code snippets, such as examples in jsdoc).
 * the formatter aspect's `Formatter` satisfies it.
 */
export type SnippetFormatter = {
  formatSnippet(snippet: string, filepath?: string): Promise<string>;
};

export type SchemaExtractorOptions = {
  formatter?: SnippetFormatter;
  tsserverPath?: string;
  contextPath?: string;
  skipInternals?: boolean;
  /**
   * Component-relative includes. Exact if no wildcard; glob-lite if contains * or **.
   * Always materialized under `internals` unless already part of the public API graph.
   */
  includeFiles?: string[];
};
