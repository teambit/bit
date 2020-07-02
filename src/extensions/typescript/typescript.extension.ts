import { TypescriptCompiler } from './typescript.compiler';

export class TypescriptExtension {
  static id = '@teambit/typescript';
  static dependencies = [];
  createCompiler(tsConfig: Record<string, any>) {
    return new TypescriptCompiler(tsConfig);
  }
  static getPackageJsonProps() {
    return { main: 'dist/{main}.js' };
  }
  static provider() {
    return new TypescriptExtension();
  }
}
