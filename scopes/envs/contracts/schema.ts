import type { Component } from './component';
import type { EnvContext, EnvHandler } from './env-handler';
import { getTsconfig } from 'get-tsconfig';
import { SCOPE_ASPECT_ID, TYPESCRIPT_ASPECT_ID, WORKSPACE_ASPECT_ID } from './aspect-ids';
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
  /**
   * available from Bit 2.2.174.
   */
  createSchemaExtractorFromOptions?(options: TypescriptSchemaExtractorOptions, context: EnvContext): SchemaExtractor;

  createSchemaExtractor(
    tsconfig: any,
    tsserverPath?: string,
    contextPath?: string,
    schemaTransformers?: unknown[],
    apiTransformers?: unknown[],
    includeFiles?: string[]
  ): SchemaExtractor;
}

/**
 * the TypeScript schema extractor for an env's `schemaExtractor()`. the extractor itself lives in the
 * typescript aspect, which Bit loads anyway, so the env asks Bit to create it.
 * replaces `TypeScriptExtractor.from(options)` of `@teambit/typescript`, with the same options.
 */
export function typescriptSchemaExtractor(options: TypescriptSchemaExtractorOptions = {}): EnvHandler<SchemaExtractor> {
  return (context: EnvContext) => {
    const typescript = context.getAspect<TypescriptSchemaProvider>(TYPESCRIPT_ASPECT_ID);
    if (!typescript) throw new Error('typescriptSchemaExtractor() needs the typescript aspect, which is not loaded');
    if (typescript.createSchemaExtractorFromOptions)
      return typescript.createSchemaExtractorFromOptions(options, context);
    // older Bit versions. the same as `TypeScriptExtractor.from()`, apart from the logger name.
    const tsconfig = getTsconfig(options.tsconfig)?.config || { compilerOptions: options.compilerOptions };
    const rootPath =
      context.getAspect<{ path: string }>(WORKSPACE_ASPECT_ID)?.path ||
      context.getAspect<{ path: string }>(SCOPE_ASPECT_ID)?.path ||
      '';
    return typescript.createSchemaExtractor(
      tsconfig,
      rootPath,
      rootPath,
      options.schemaTransformers,
      options.apiTransformers,
      options.includeFiles
    );
  };
}
