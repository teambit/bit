import ts, { TsConfigSourceFile } from 'typescript';
import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaMain } from '@teambit/schema';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { TypeScriptParser } from './typescript.parser';

export class TypescriptMain {
  constructor(private logger: Logger) {}
  /**
   * create a new compiler.
   */
  createCompiler(options: TypeScriptCompilerOptions, tsModule = ts): Compiler {
    return new TypescriptCompiler(TypescriptAspect.id, this.logger, options, tsModule);
  }

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(tsconfig: TsConfigSourceFile) {
    return new TypeScriptExtractor(tsconfig);
  }

  /**
   * add the default package json properties to the component
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getPackageJsonProps() {
    return {
      main: 'dist/{main}.js',
      types: '{main}.ts',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerAspect];

  static async provider([schema, loggerExt]: [SchemaMain, LoggerMain]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);

    return new TypescriptMain(logger);
  }
}

TypescriptAspect.addRuntime(TypescriptMain);
