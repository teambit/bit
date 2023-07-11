export { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
export { TypeScriptExtractor } from './typescript.extractor';
export { TypescriptCompiler } from './typescript.compiler';
export type {
  TypescriptMain,
  TsConfigTransformer,
  SchemaTransformerSlot,
  APITransformerSlot,
} from './typescript.main.runtime';
export type { TypeScriptCompilerOptions, TsCompilerOptionsWithoutTsConfig } from './compiler-options';
export { TypescriptAspect } from './typescript.aspect';
export type { TypescriptCompilerInterface } from './typescript-compiler-interface';
export type { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';
export { expandIncludeExclude } from './expand-include-exclude';
export { GLOBAL_TYPES_DIR } from './ts-config-writer';
export { SchemaExtractorContext } from './schema-extractor-context';
export * from './sourceFileTransformers';
