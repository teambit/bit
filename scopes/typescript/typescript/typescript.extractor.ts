// import { tmpdir } from 'os';
import { TsConfigSourceFile } from 'typescript';
// import { resolve, join } from 'path';
import { SchemaExtractor } from '@teambit/schema';
import { Component } from '@teambit/component';
import { Application } from 'typedoc';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(private tsconfig: TsConfigSourceFile) {}

  // @ts-ignore
  async extract(component: Component) {
    // const tsconfig = this.tsconfig;
    const paths = component.state.filesystem.files.map((file) => file.path).filter((path) => path.endsWith('index.ts'));
    // const paths = ['/Users/ranmizrahi/Bit/bit/scopes/workspace/workspace/index.ts'];
    const typedocApp = new Application();
    typedocApp.options.setValues({
      inputFiles: paths,
      allowJs: true,
      lib: ['lib.es2015.d.ts', 'lib.es2019.d.ts', 'lib.es6.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      jsx: 2,
      noEmit: true,
      exclude: ['node_modules', '*.scss'],
      esModuleInterop: true,
    });
    const docs = typedocApp.convert(paths);
    if (!docs) throw new Error();
    const object = typedocApp.serializer.projectToObject(docs);
    return object;
  }
}
