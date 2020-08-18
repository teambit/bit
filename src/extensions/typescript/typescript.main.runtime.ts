import { TypescriptCompiler } from './typescript.compiler';
import { SchemaExtension } from '../schema';
import { TypeScriptParser } from './typescript.parser';
import { TypeScriptCompilerOptions } from './compiler-options';
import { Compiler } from '../compiler';
import { Logger, LoggerExtension } from '../logger';

export class TypescriptExtension {
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
  static dependencies = [SchemaExtension, LoggerExtension];

  static provider([schema, loggerExt]: [SchemaExtension, LoggerExtension]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptExtension.id);
    return new TypescriptExtension(logger);
  }
}
