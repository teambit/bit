export { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
export { TypeScriptExtractor } from './typescript.extractor';
export { TypescriptCompiler } from '@teambit/typescript.typescript-compiler';
export type {
  TypescriptMain,
  TsConfigTransformer,
  SchemaTransformerSlot,
  APITransformerSlot,
} from './typescript.main.runtime';
export type { TypeScriptCompilerOptions, TsCompilerOptionsWithoutTsConfig } from './compiler-options';
export { TypescriptAspect } from './typescript.aspect';
export * from './sourceFileTransformers';
export type { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';
export { SchemaExtractorContext } from './schema-extractor-context';
