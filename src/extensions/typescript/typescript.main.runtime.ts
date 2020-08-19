import { TypescriptAspect } from './typescript.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { SchemaAspect } from '../schema';
import type { SchemaMain } from '../schema';
import { TypeScriptParser } from './typescript.parser';
import { TypeScriptCompilerOptions } from './compiler-options';
import { Compiler } from '../compiler';
import { Logger, LoggerExtension } from '../logger';

export class TypescriptMain {
  constructor(private logger: Logger) {}
  /**
   * create a new compiler.
   */
  createCompiler(options: TypeScriptCompilerOptions): Compiler {
    return new TypescriptCompiler(this.logger, options);
  }

  resolveTypeFile() {}

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

  static id = '@teambit/typescript';
  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerExtension];

  static async provider([schema, loggerExt]: [SchemaMain, LoggerExtension]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptMain.id);
    return new TypescriptMain(logger);
  }
}

TypescriptAspect.addRuntime(TypescriptMain);
