// import { tmpdir } from 'os';
import { join } from 'path';
import { Module, SchemaExtractor } from '@teambit/schema';
import { Component } from '@teambit/component';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Application, DocumentationEntryPoint } from 'typedoc';
import { ComponentPrograms } from './component-programs';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(private componentPrograms: ComponentPrograms) {}

  async extract(component: Component) {
    // return this.extractAll();
    if (!this.componentPrograms) {
      throw new Error(
        'unable to run Typescript Schema Extractor, make sure the watch is running and its check-types flag is enabled'
      );
    }
    const compProgram = this.componentPrograms.getItem(component.id);
    if (!compProgram) {
      throw new Error(
        `unable to find component program for ${component.id.toString()}. Existing ids are: ${this.componentPrograms
          .getAllComponentIds()
          .map((c) => c.toString())
          .join('\n')}`
      );
    }
    const program = compProgram.program;
    if (!program) {
      throw new Error(`unable to find ts.program for ${component.id.toString()}`);
    }
    const mainFile = component.state._consumer.mainFile;
    const mainFileAbs = join(compProgram.componentDir, mainFile);
    const sourceFile = program.getSourceFile(mainFileAbs);
    if (!sourceFile) {
      throw new Error(`unable to find ts.sourceFile for ${component.id.toString()}, main-file: ${mainFile}`);
    }
    // do something with the program and convert it to Module using TypeDoc
    const app = new Application();
    const entryPoint: DocumentationEntryPoint[] = [
      {
        displayName: component.id.toStringWithoutVersion(),
        program,
        sourceFile,
      },
    ];
    const project = app.converter.convert(entryPoint);

    const outputDir = 'docs';

    // Rendered docs
    await app.generateDocs(project, outputDir);

    return program as any as Module;
  }

  async extractAll() {
    if (!this.componentPrograms) {
      throw new Error(
        'unable to run Typescript Schema Extractor, make sure the watch is running and its check-types flag is enabled'
      );
    }
    const compPrograms = this.componentPrograms.getAll();
    const app = new Application();
    const entryPoints: DocumentationEntryPoint[] = compPrograms.map((compProgram) => {
      const { program, component } = compProgram;
      if (!program) {
        throw new Error(`unable to find ts.program for ${component.id.toString()}`);
      }
      const mainFile = component.state._consumer.mainFile;
      const mainFileAbs = join(compProgram.componentDir, mainFile);
      const sourceFile = program.getSourceFile(mainFileAbs);
      if (!sourceFile) {
        throw new Error(`unable to find ts.sourceFile for ${component.id.toString()}, main-file: ${mainFile}`);
      }
      return {
        displayName: component.id.toStringWithoutVersion(),
        program,
        sourceFile,
      };
    });

    const project = app.converter.convert(entryPoints);

    const outputDir = 'docs-all';

    // Rendered docs
    await app.generateDocs(project, outputDir);

    return project as any as Module;
  }
}

// export class TypeScriptExtractor implements SchemaExtractor {
//   constructor(private tsconfig: TsConfigSourceFile) {}

//   async extract(component: Component) {
//     // const tsconfig = this.tsconfig;
//     const paths = component.state.filesystem.files.map((file) => file.path).filter((path) => path.endsWith('index.ts'));
//     // const paths = ['/Users/ranmizrahi/Bit/bit/scopes/workspace/workspace/index.ts'];
//     const app = new Application();
//     app.bootstrap({
//       // typedoc options here
//       entryPoints: paths,
//     });
//     const project = app.convert();
//     // typedocApp.options.setValues({
//     //   inputFiles: paths,
//     //   allowJs: true,
//     //   lib: ['lib.es2015.d.ts', 'lib.es2019.d.ts', 'lib.es6.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
//     //   jsx: 2,
//     //   noEmit: true,
//     //   exclude: ['node_modules', '*.scss'],
//     //   esModuleInterop: true,
//     // });
//     if (!project) throw new Error('typedoc failed generating docs');
//     return app.serializer.projectToObject(project) as any as Module;
//   }
// }
