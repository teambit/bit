import { TypescriptCompiler } from './typescript.compiler';
import { SchemaExtension } from '../schema';
import { TypeScriptParser } from './typescript.parser';
import { TypeScriptCompilerOptions } from './compiler-options';

export class TypescriptExtension {
  /**
   * create a new compiler.
   */
  createCompiler(options: TypeScriptCompilerOptions) {
    return new TypescriptCompiler(options.tsconfig, options.types);
  }

  resolveTypeFile() {}

  /**
   * add the default package json properties to the component
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getPackageJsonProps() {
    return { main: 'dist/{main}.js' };
  }

  static id = '@teambit/typescript';
  static dependencies = [SchemaExtension];

  static provider([schema]: [SchemaExtension]) {
    schema.registerParser(new TypeScriptParser());
    return new TypescriptExtension();
  }
}
