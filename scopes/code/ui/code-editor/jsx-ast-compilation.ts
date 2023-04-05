/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable import/no-mutable-exports */

import Project, { Node as tsNode, ts, SourceFile } from 'ts-simple-ast';
import {
  CodeWorkerRequest,
  CodeWorkerRequestJsxAst,
  CodeWorkerResponseJsxAsNode,
  CodeWorkerResponseJsxAst,
  CodeWorkerResponseJsxAstDiagnostic,
  lastRequest,
} from './code-worker';
import { createProject, getChildrenForEachChild } from './ts-simple-ast';
import { tryTo } from './extract-code-decorations';

interface JsxAstResult {
  jsxAst: CodeWorkerResponseJsxAst;
  sourceFile: SourceFile;
  project: Project;
}
export let jsxAstLastResult: JsxAstResult;

export function doJSXAst(data: CodeWorkerRequest): JsxAstResult {
  if (
    lastRequest &&
    data.code === lastRequest.code &&
    JSON.stringify(data.jsxAst || {}) === JSON.stringify(lastRequest.jsxAst || {})
  ) {
    return jsxAstLastResult;
  }
  const project = createProject([
    {
      fileName: 't1.tsx',
      content: data.code,
    },
  ]);
  const config: CodeWorkerRequestJsxAst = data.jsxAst || { mode: 'forEachChild' };
  const sourceFile = project.getSourceFiles().find((s) => s.getFilePath().endsWith('t1.tsx'));
  const ast = buildJsxAstNode(sourceFile, config);
  const diagnostics = config.showDiagnostics ? buildJsxAstDiagnostics(project) : [];
  const jsxAst = { ast, diagnostics, config: data.jsxAst } as any;
  jsxAstLastResult = { jsxAst, sourceFile, project };
  return jsxAstLastResult;
}

function buildJsxAstDiagnostics(project: Project): CodeWorkerResponseJsxAstDiagnostic[] {
  const f = project.getSourceFiles().find((s) => s.getFilePath().endsWith('t1.tsx'))!;
  return f.getPreEmitDiagnostics().map((tsd) => {
    const d: CodeWorkerResponseJsxAstDiagnostic = {
      message: ts.flattenDiagnosticMessageText(tsd.compilerObject.messageText, '\n'),
      code: tsd.getCode(),
      length: tsd.getLength(),
      lineNumber: tsd.getLineNumber(),
      start: tsd.getStart(),
      startColumn: ts.getLineAndCharacterOfPosition(tsd.getSourceFile()!.compilerNode, tsd.getStart()!).character + 1,
      startLineNumber: ts.getLineAndCharacterOfPosition(tsd.getSourceFile()!.compilerNode, tsd.getStart()!).line + 1,
      endColumn:
        ts.getLineAndCharacterOfPosition(tsd.getSourceFile()!.compilerNode, tsd.getStart()! + tsd.getLength()!)
          .character + 1,
      endLineNumber:
        ts.getLineAndCharacterOfPosition(tsd.getSourceFile()!.compilerNode, tsd.getStart()! + tsd.getLength()!).line +
        1,
    };
    return d;
  });
}

function buildJsxAstNode(n: tsNode, config: CodeWorkerRequestJsxAst): CodeWorkerResponseJsxAsNode {
  let text = n.getText().trim();
  const children = config.mode === 'forEachChild' ? getChildrenForEachChild(n) : n.getChildren();
  text = text.substring(0, Math.max(config.nodeTextLength || 20, text.length));
  const type = tryTo(() => n.getType().getApparentType().getText() || n.getType().getText()) || 'TODO';
  const node: CodeWorkerResponseJsxAsNode = {
    kind: n.getKindName(),
    type,
    text,
    start: n.getStart(),
    end: n.getEnd(),
    startColumn:
      ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getStart()).character + 1,
    startLineNumber:
      ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getStart()).line + 1,
    endColumn: ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getEnd()).character + 1,
    endLineNumber: ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getEnd()).line + 1,
    children: children.map((c) => buildJsxAstNode(c, config)),
  };
  return node;
}
