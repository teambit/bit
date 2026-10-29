import type { Component } from './component';
import type { EnvContext, EnvHandler } from './env-handler';
import { TYPESCRIPT_ASPECT_ID } from './aspect-ids';
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

export type TypescriptSchemaExtractorOptions = {
  /**
   * name of the extractor, used for the logger.
   */
  name?: string;

  /**
   * path to the tsconfig file to use.
   */
  tsconfig?: string;

  /**
   * compiler options to use when no tsconfig is given.
   */
  compilerOptions?: string;

  /**
   * schema transformers of the typescript aspect, to add to the ones the aspect has.
   */
  schemaTransformers?: unknown[];

  /**
   * api transformers of the typescript aspect, to add to the ones the aspect has.
   */
  apiTransformers?: unknown[];

  /**
   * files to include in the extraction, in addition to the component's main file.
   */
  includeFiles?: string[];
};

/**
 * the part of the typescript aspect that creates schema extractors.
 */
export interface TypescriptSchemaProvider {
  createSchemaExtractorFromOptions(options: TypescriptSchemaExtractorOptions, context: EnvContext): SchemaExtractor;
}

/**
 * the TypeScript schema extractor for an env's `schemaExtractor()`. the extractor itself lives in the
 * typescript aspect, which Bit loads anyway, so the env asks Bit to create it.
 * replaces `TypeScriptExtractor.from(options)` of `@teambit/typescript`, with the same options.
 */
export function typescriptSchemaExtractor(options: TypescriptSchemaExtractorOptions = {}): EnvHandler<SchemaExtractor> {
  return (context: EnvContext) => {
    const typescript = context.getAspect<TypescriptSchemaProvider>(TYPESCRIPT_ASPECT_ID);
    if (!typescript?.createSchemaExtractorFromOptions) {
      throw new Error(
        'typescriptSchemaExtractor() needs a newer version of Bit. update Bit, or use TypeScriptExtractor.from() of @teambit/typescript'
      );
    }
    return typescript.createSchemaExtractorFromOptions(options, context);
  };
}
