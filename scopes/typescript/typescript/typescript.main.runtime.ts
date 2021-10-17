import ts from 'typescript';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { TypeScriptParser } from './typescript.parser';
import { SchemaTransformer } from './schema-transformer';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { SchemaTransformerPlugin } from './schema-transformer.plugin';
import { ExportDeclaration } from './transformers';

export type TsMode = 'build' | 'dev';

export type SchemaTransformerSlot = SlotRegistry<SchemaTransformer[]>;

export type TsConfigTransformContext = {
  // mode: TsMode;
};

export type TsConfigTransformer = (
  config: TypescriptConfigMutator,
  context: TsConfigTransformContext
) => TypescriptConfigMutator;

export class TypescriptMain {
  constructor(private logger: Logger, private schemaTransformerSlot: SchemaTransformerSlot) {}
  /**
   * create a new compiler.
   */
  createCompiler(
    options: TypeScriptCompilerOptions,
    transformers: TsConfigTransformer[] = [],
    tsModule = ts
  ): Compiler {
    const configMutator = new TypescriptConfigMutator(options);
    const transformerContext: TsConfigTransformContext = {};
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    return new TypescriptCompiler(TypescriptAspect.id, this.logger, afterMutation.raw, tsModule);
  }

  registerSchemaTransformer(schemaTransformers: SchemaTransformer[]) {
    this.schemaTransformerSlot.register(schemaTransformers);
    return this;
  }

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(tsconfig: any): SchemaExtractor {
    return new TypeScriptExtractor(tsconfig, this.schemaTransformerSlot);
  }

  /**
   * add the default package json properties to the component
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getPackageJsonProps(): PackageJsonProps {
    return {
      main: 'dist/{main}.js',
      types: '{main}.ts',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerAspect, AspectLoaderAspect];
  static slots = [Slot.withType<SchemaTransformer[]>()];

  static async provider(
    [schema, loggerExt, aspectLoader]: [SchemaMain, LoggerMain, AspectLoaderMain],
    config,
    [schemaTransformerSlot]: [SchemaTransformerSlot]
  ) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);
    aspectLoader.registerPlugins([new SchemaTransformerPlugin(schemaTransformerSlot)]);
    schemaTransformerSlot.register([new ExportDeclaration()]);

    return new TypescriptMain(logger, schemaTransformerSlot);
  }
}

TypescriptAspect.addRuntime(TypescriptMain);

export function runTransformersWithContext(
  config: TypescriptConfigMutator,
  transformers: TsConfigTransformer[] = [],
  context: TsConfigTransformContext
): TypescriptConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
