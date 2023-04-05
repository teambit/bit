/* eslint-disable no-restricted-globals */
/* eslint-disable import/no-mutable-exports */
/* eslint-disable no-plusplus */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-multi-assign */

import { install } from 'jsx-alone-dom-dom';
import { JsonImplOutputEl, isJsonImplOutputEl, JSXAloneJsonImpl, getGlobal } from 'jsx-alone-core';

import { JSXAlone as JSXAloneStringImpl } from 'jsx-alone-string';
import { JSXAlone as JSXAloneDomImpl } from 'jsx-alone-dom';
import { ts } from 'ts-simple-ast';
import React from 'react';
import { doJSXAst } from './jsxAstCompilation';
import { Classification, extractCodeDecorations } from './extract-code-decorations';

interface SelectableInMonaco {
  startColumn: number;
  startLineNumber: number;
  endColumn: number;
  endLineNumber: number;
}
export interface CodeWorkerResponseJsxAsNode extends SelectableInMonaco {
  type: string;
  text: string;
  kind: string;
  start: number;
  end: number;
  children: CodeWorkerResponseJsxAsNode[];
}
export interface CodeWorkerResponseJsxAstDiagnostic extends SelectableInMonaco {
  message: string;
  lineNumber: number | undefined;
  start: number | undefined;
  length: number | undefined;
  code: number;
}

export interface CodeWorkerError {
  message: string;
  stack?: string;
  name: string;
}
export interface CodeWorkerResponseJsxAst {
  diagnostics: CodeWorkerResponseJsxAstDiagnostic[];
  ast: CodeWorkerResponseJsxAsNode;
}
export interface CodeWorkerResponse {
  version: number;
  jsxSyntaxHighLight: {
    classifications: Classification[];
  };
  evaluate: {
    result?: JsonImplOutputEl;
    error?: CodeWorkerError;
    evaluated: string;
  };
  jsxAst: CodeWorkerResponseJsxAst;
  error?: CodeWorkerError;
  totalTime: number;
}
export interface EvaluateTimes {
  eval?: number;
  render?: number;
}
export interface CodeWorkerRequest {
  code: string;
  title: string;
  version: number;
  jsxAst: CodeWorkerRequestJsxAst;
}
export interface CodeWorkerRequestJsxAst {
  showDiagnostics?: boolean;
  mode: 'forEachChild' | 'getChildren';
  nodeTextLength?: number;
}

export function compileTs(code: string) {
  const res = ts.transpileModule(code, {
    compilerOptions: {
      target: 'es2018',
      rootDir: '.',
      strict: false,
      lib: ['es2018'],
      module: ts.ModuleKind.None,
      jsx: 'react',
      jsxFactory: 'JSXAlone.createElement',
    },
  } as any);
  return res.outputText;
}

export function createProgram(
  files: {
    fileName: string;
    content: string;
    sourceFile?: ts.SourceFile;
  }[],
  compilerOptions?: ts.CompilerOptions
): ts.Program {
  const tsConfigJson = ts.parseConfigFileTextToJson(
    'tsconfig.json',
    compilerOptions
      ? JSON.stringify(compilerOptions)
      : `{
    "compilerOptions": {
      "target": "es2018",
      "module": "commonjs",
      "lib": ["es2018"],
      "rootDir": ".",
      "strict": false,
      "esModuleInterop": true,
    }
  }`
  );
  const { options, errors } = ts.convertCompilerOptionsFromJson(tsConfigJson.config.compilerOptions, '.');
  if (errors.length) {
    throw errors;
  }
  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getSourceFile = function (fileName: string): ts.SourceFile | undefined {
    const file = files.find((f) => f.fileName === fileName);
    if (!file) {
      return undefined;
    }
    file.sourceFile = file.sourceFile || ts.createSourceFile(fileName, file.content, ts.ScriptTarget.ES2015, true);
    return file.sourceFile;
  };
  return ts.createProgram(
    files.map((f) => f.fileName),
    options,
    compilerHost
  );
}

/**
 * Iterates recursively over all children of given node and apply visitor on each of them. If visitor returns
 * non falsy value then it stops visiting and that value is returned to the caller. See
 * https://en.wikipedia.org/wiki/Tree_traversal for the meaning of "DeepFirst".
 *
 * @param getChildrenMode if true it will use `node.getChildren()` o obtain children instead of default
 * behavior that is using `node.forEachChild`
 */
export function visitChildrenRecursiveDeepFirst(
  node: ts.Node,
  visitor: (node: ts.Node, index?: number, level?: number) => ts.Node | undefined | void,
  index = 0,
  level = 0,
  stopOnTruthy = false,
  getChildrenMode = false
): ts.Node | undefined {
  if (!node) {
    return undefined;
  }
  const result = visitor(node, index, level);
  if (stopOnTruthy && result) {
    return result;
  }
  let i = 0;
  if (!getChildrenMode) {
    return node.forEachChild((child) =>
      visitChildrenRecursiveDeepFirst(child, visitor, i++, level + 1, stopOnTruthy, getChildrenMode)
    );
  }

  node
    .getChildren()
    .forEach((child) => visitChildrenRecursiveDeepFirst(child, visitor, i++, level + 1, stopOnTruthy, getChildrenMode));
  return undefined;
}
const buffer: string[] = [];
export function dumpAst(ast: ts.Node | undefined, getChildrenMode = false, printIndex = false): string {
  if (!ast) {
    return '';
  }
  function print(node: ts.Node, index = 0, level = 0) {
    buffer.push(printNode(node, index, level, printIndex));
  }
  visitChildrenRecursiveDeepFirst(ast, print, undefined, undefined, false, getChildrenMode);
  return buffer.join('\n');
}

export function printNode(node: ts.Node, index = -1, level = 0, printIndex = false): string {
  const indent = new Array(level).map(() => '').join('  ');
  const name = node.kind === ts.SyntaxKind.Identifier ? `${(node as ts.Identifier).text} ` : '';
  const indexStr = printIndex ? (index !== -1 ? `#${index} ` : '') : '';
  let shortText = node.getText().replace(/[\s\n]+/g, ' ');
  shortText = shortText.substr(0, Math.min(shortText.length, 60));
  return `${indent}${indexStr}${name}${getKindName(node.kind)} : "${shortText}"`;
}

/** get the kind name as string of given kind value or node */
export function getKindName(kind: number | ts.Node): string {
  return kind || kind === 0 ? getEnumKey(ts.SyntaxKind, (kind as ts.Node).kind || kind) : 'undefined';
}
export let lastRequest: CodeWorkerRequest | undefined;

if (typeof self !== 'undefined' && typeof self.onmessage === 'object') {
  install();

  getGlobal().addEventListener('message', ({ data }: { data: CodeWorkerRequest }) => {
    if (!lastRequest) {
      lastRequest = { ...data, code: '' };
    }

    const t0 = Date.now();

    const { jsxAst, sourceFile } = doJSXAst(data); // do it first so extractCodeDecorations can reuse generated sourceFile
    const m: CodeWorkerResponse = {
      ...{
        version: data.version,
        jsxSyntaxHighLight: {
          classifications: extractCodeDecorations(data, sourceFile),
        },
        evaluate: evaluate(data.code),
        jsxAst,
      },
      totalTime: Date.now() - t0,
    };
    lastRequest = data;

    // @ts-ignore
    getGlobal().postMessage(m);
  });
}

export interface EvaluateResult<T = JsonImplOutputEl> {
  result?: T;
  error?: CodeWorkerError;
  evaluated: string;
}

let results: EvaluateResult;

export function evaluate<T = JsonImplOutputEl>(
  jsx: string,
  impl: 'json' | 'dom' | 'string' = 'json',
  times?: EvaluateTimes
): EvaluateResult<T> {
  if (lastRequest && jsx === lastRequest.code) {
    return results as any;
  }
  const jsxFixed = jsx.substring(jsx.indexOf('function'), jsx.length);
  const emitted = compileTs(jsxFixed);
  const s = `(${emitted})()`;

  const { result, error } = evaluateOnly(s, impl, times);

  results = { result, error, evaluated: s };
  return results as any;
}

function renderWithImpl<T>(fn: () => JSX.Element, impl: 'json' | 'dom' | 'string', config?: any): T {
  const JSXAlone = (getGlobal().JSXAlone =
    impl === 'dom' ? JSXAloneDomImpl : impl === 'string' ? JSXAloneStringImpl : JSXAloneJsonImpl);
  return JSXAlone.render(fn(), config as any) as any;
}
function evaluateOnly<T = JsonImplOutputEl>(
  s: string,
  impl: 'json' | 'dom' | 'string' = 'json',
  times?: EvaluateTimes
): {
  result?: T;
  error?: CodeWorkerError;
} {
  let error: CodeWorkerError | undefined;
  let result: T | undefined;
  try {
    // The import statement in tests forces us to declare following names here:
    // import {JSXAlone, JSXAloneDom, JSXAloneString, JSXAloneJson,
    //   ElementClassDom, ElementClassJson, ElementClassString } from '.'
    const JSXAlone = (getGlobal().JSXAlone =
      impl === 'dom' ? JSXAloneDomImpl : impl === 'string' ? JSXAloneStringImpl : JSXAloneJsonImpl);
    const JSXAloneDom = (getGlobal().JSXAloneDom = JSXAloneDomImpl);
    const JSXAloneString = (getGlobal().JSXAloneString = JSXAloneStringImpl);
    const JSXAloneJson = (getGlobal().JSXAloneJson = JSXAloneJsonImpl);
    getGlobal().JSXAloneString = JSXAloneString;
    getGlobal().JSXAloneJson = JSXAloneJson;
    getGlobal().JSXAloneDom = JSXAloneDom;
    getGlobal().renderWithImpl = renderWithImpl;

    const evalT0 = Date.now();
    // eslint-disable-next-line no-eval
    const jsxElementOrString = eval(s);
    times && (times.eval = Date.now() - evalT0);
    const renderT0 = Date.now();
    result =
      typeof jsxElementOrString === 'string'
        ? (JSXAlone.render(<div id="test-returned-string">{jsxElementOrString}</div>) as T)
        : (JSXAlone.render(jsxElementOrString) as T);

    times && (times.render = Date.now() - renderT0);

    impl === 'json' && removeCirclesJsonImplOutput(result);
  } catch (ex: any) {
    error = { message: ex.message || `${ex}`, stack: ex.stack, name: ex.name || `${ex}` };
    console.error('Error in worker: ', ex);
    // throw   ex
  }
  return { result, error };
}

function removeCirclesJsonImplOutput(r: any): any {
  if (r && isJsonImplOutputEl(r)) {
    delete (r as any).parentElement;
    // r.attrs = objectMap(r.attrs||{}, (a,v)=>typeof v === 'function' ? v.toString() :v) // TODO: if we do this - seems it's evaluated with the example and error foo_foo.objectMap is not a function is thrown !!!
    Object.keys(r.attrs).forEach((a) => {
      r.attrs[a] = typeof r.attrs[a] === 'function' ? r.attrs[a].toString() : r.attrs[a];
    });
    (r.children || []).forEach((c: any) => removeCirclesJsonImplOutput(c));
  }
}
function getEnumKey(anEnum: any, value: any): string {
  // eslint-disable-next-line no-restricted-syntax
  for (const key in anEnum) {
    if (value === anEnum[key]) {
      return key;
    }
  }
  return '';
}
