import { Node, Project, ts, FileSystemHost } from 'ts-simple-ast';
import { lib_es5_d_ts } from '../util/filesPacked/lib_es5_d_ts';
import { lib_dom_d_ts } from '../util/filesPacked/lib_dom_d_ts';
import { jsx_alone_core_d_ts } from '../util/filesPacked/jsx_alone_core_d_ts';
import { lib_es2015_core_d_ts } from '../util/filesPacked/lib_es2015_core_d_ts';
import { JsxEmit, ModuleResolutionKind, ModuleKind } from 'typescript';
import { lib_es2015_symbol_d_ts } from '../util/filesPacked/lib_es2015_symbol_d_ts';
import { lib_es2015_iterable_d_ts } from '../util/filesPacked/lib_es2015_iterable_d_ts';
// import { lib_d_ts } from '../util/filesPacked/lib_d_ts';
// import { lib_es2015_collection_d_ts } from '../util/filesPacked/lib_es2015_collection_d_ts';
// import { lib_es2015_d_ts } from '../util/filesPacked/lib_es2015_d_ts';
// import { lib_es2015_generator_d_ts } from '../util/filesPacked/lib_es2015_generator_d_ts';
// import { lib_es2015_symbol_wellknown_d_ts } from '../util/filesPacked/lib_es2015_symbol_wellknown_d_ts';
// import { lib_es2015_reflect_d_ts } from '../util/filesPacked/lib_es2015_reflect_d_ts';
// import { lib_es2015_proxy_d_ts } from '../util/filesPacked/lib_es2015_proxy_d_ts';
// import { lib_es2015_promise_d_ts } from '../util/filesPacked/lib_es2015_promise_d_ts';
// import { lib_scripthost_d_ts } from '../util/filesPacked/lib_scripthost_d_ts';
// import { lib_webworker_d_ts } from '../util/filesPacked/lib_webworker_d_ts';
// import { lib_webworker_importscripts_d_ts } from '../util/filesPacked/lib_webworker_importscripts_d_ts';

let project: Project | undefined;

export function createProject(files: { fileName: string; content: string }[]): Project {
  if (!project) {
    project = new Project({
      useVirtualFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2016,
        moduleResolution: ModuleResolutionKind.NodeJs,
        // module: ModuleKind.CommonJS,
        // noEmit: true,
        // strict: true,
        jsx: JsxEmit.React,
        jsxFactory: 'JSXAlone.createElement',
        libs: ['es2015', 'dom'],
        // typeRoots: ['node_modules/@types'],
      },
    });

    const fs: FileSystemHost = project.getFileSystem();
    // fs.writeFileSync(`node_modules/typescript/lib/lib.d.ts`, lib_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.d.ts`, lib_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es5.d.ts`, lib_es5_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.core.d.ts`, lib_es2015_core_d_ts);
    fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.symbol.d.ts`, lib_es2015_symbol_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.iterable.d.ts`, lib_es2015_iterable_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.collection.d.ts`, lib_es2015_collection_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.d.ts`, lib_es2015_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.promise.d.ts`, lib_es2015_promise_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.proxy.d.ts`, lib_es2015_proxy_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.reflect.d.ts`, lib_es2015_reflect_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts`, lib_es2015_symbol_wellknown_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.scripthost.d.ts`, lib_scripthost_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.webworker.d.ts`, lib_webworker_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.webworker.importscripts.d.ts`, lib_webworker_importscripts_d_ts);

    // fs.writeFileSync(`node_modules/typescript/lib/lib.dom.d.ts`, lib_dom_d_ts);

    // fs.writeFileSync(`node_modules/jsx-alone/index.d.ts`, jsx_alone_core_d_ts);

    // project.createSourceFile('lib.d.ts', lib_d_ts)
    project.createSourceFile('lib.es5.d.ts', lib_es5_d_ts);
    project.createSourceFile('lib.es2015.core.d.ts', lib_es2015_core_d_ts);
    // project.createSourceFile('lib.es2015.symbol.d.ts', lib_es2015_symbol_d_ts)
    project.createSourceFile('lib.es2015.iterable.d.ts', lib_es2015_iterable_d_ts);
    project.createSourceFile('lib.dom.d.ts', lib_dom_d_ts);
    // fs.writeFileSync(`node_modules/typescript/lib/lib.es2015.iterable.d.ts`, lib_es2015_iterable_d_ts);

    // project.createSourceFile('node_modules/typescript/lib/lib.es5.d.ts', lib_es5_d_ts)
    // project.createSourceFile('node_modules/typescript/lib/lib.es2015.core.d.ts', lib_es2015_core_d_ts)
    // project.createSourceFile('node_modules/typescript/lib/lib.es2015.symbol.d.ts', lib_es2015_symbol_d_ts)
    // project.createSourceFile('node_modules/typescript/lib/lib.es2015.iterable.d.ts', lib_es2015_iterable_d_ts)
    // project.createSourceFile('node_modules/typescript/lib/lib.dom.d.ts', lib_dom_d_ts)

    project.createSourceFile('index.d.ts', jsx_alone_core_d_ts);

    files.forEach((f) => project!.createSourceFile(f.fileName, f.content, { overwrite: true }));
  } else {
    files.forEach((f) => {
      let sf = project!.getSourceFile(f.fileName);
      if (!sf) {
        // this only happens in tests
        sf = project!.createSourceFile(f.fileName, f.content);
      } else if (sf!.getText() !== f.content) {
        sf.replaceWithText(f.content);
      }
    });
  }
  project.saveSync();
  return project;
}

/**
 * like Node.getChildren but using forEachChild(). TODO: perhaps is a good idea to add a useForEachChild to
 * ts-simple-ast getChildren that is optional but if provided do this ?
 */
export function getChildrenForEachChild(n: Node): Node[] {
  const result: Node[] = [];
  n.forEachChild((n) => result.push(n));
  return result;
}
