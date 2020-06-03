import { TypescriptCompiler } from './typescript.compiler';

export class TypescriptExtension {
  static dependencies = [];
  createCompiler(tsConfig: Record<string, any>) {
    return new TypescriptCompiler(tsConfig);
  }
  static provider() {
    return new TypescriptExtension();
  }
}
