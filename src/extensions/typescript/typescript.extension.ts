import { TypescriptCompiler } from './typescript.compiler';
import { SchemaExtension } from '../schema';
import { TypeScriptParser } from './typescript.parser';

export class TypescriptExtension {
  /**
   * create a new compiler.
   */
  createCompiler(tsConfig: Record<string, any>) {
    return new TypescriptCompiler(tsConfig);
  }

  static id = '@teambit/typescript';
  static dependencies = [SchemaExtension];

  static provider([schema]: [SchemaExtension]) {
    schema.registerParser(new TypeScriptParser());
    return new TypescriptExtension();
  }
}
