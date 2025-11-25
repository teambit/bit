import type { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';

export type ExtractorOptions = {
  /**
   * name of the string.
   */
  name?: string;

  /**
   * tsconfig string path.
   */
  tsconfig?: string;

  /**
   * TODO: support typescript module path.
   */
  // typescript?: string;

  /**
   * typescript compiler options. always overrides all.
   */
  compilerOptions?: string;

  /**
   * schema transformers.
   */
  schemaTransformers?: SchemaTransformer[];

  /**
   * api transformers.
   */
  apiTransformers?: SchemaNodeTransformer[];

  /**
   * Component-relative includes. Exact if no wildcard; glob-lite if contains * or **.
   * Always materialized under `internals` unless already part of the public API graph.
   */
  includeFiles?: string[];
};
