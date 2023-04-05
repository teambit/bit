/**
 *  adapted from
 * @link https://github.com/CompuIves/codesandbox-client/blob/196301c919dd032dccc08cbeb48cf8722eadd36b/packages/app/src/app/components/CodeEditor/Monaco/workers/syntax-highlighter.js
 */
import { SourceFile, Node, TypeGuards } from 'ts-simple-ast';
import { lastRequest } from './code-worker.tsx';

export function tryTo<F extends (...args: any[]) => any>(f: F): ReturnType<F> | undefined {
  try {
    return f();
  } catch (error) {
    return undefined;
  }
}

export interface CodeWorkerRequestJsxAst {
  showDiagnostics?: boolean;
  mode: 'forEachChild' | 'getChildren';
  nodeTextLength?: number;
}
export interface CodeWorkerRequest {
  code: string;
  title: string;
  version: number;
  jsxAst: CodeWorkerRequestJsxAst;
}

export interface Classification {
  startColumn: number;
  startLineNumber: number;
  endLineNumber: number;
  // modifiers?: Modifier[]
  endColumn: number;
  kind: string;
  parentKind?: string;
  // type?: ParentShipKind
  // nodeType?: string
  extra?: string[];
}

let classifications: Classification[] = [];

export function extractCodeDecorations(data: CodeWorkerRequest, sourceFile: SourceFile) {
  if (lastRequest && data.code === lastRequest.code) {
    return classifications;
  }
  classifications = [];

  if (!sourceFile) {
    console.error(`extractCodeDecorations now needs a sourceFile`);
  }

  addChildNodes(sourceFile, classifications, sourceFile);
  return classifications;
}

function filterNonJsxRelatedNodes(n: Node) {
  // this is faster - we just dont want syntax list since they pollute a lot the JSX.
  return n.getKindName() !== 'SyntaxList';

  // But these are other more elegant ways:

  // // only pass those with ancestors or with first-level children which are JSX :
  // if (n.getKindName()!.toLowerCase().includes('jsx')) {
  //   return true
  // }
  // else if(n.getFirstAncestor(a=>a.getKindName()!.toLowerCase().includes('jsx'))){
  //   return true
  // }
  // else {
  //   return n.getFirstChild(a=>a.getKindName()!.toLowerCase().includes('jsx')))
  // }
}

function addChildNodes(node: Node, _classifications: Classification[], sourceFile: SourceFile) {
  const lines = sourceFile
    .getFullText()
    .split('\n')
    .map((line) => line.length);
  node
    .getDescendants()
    .filter(filterNonJsxRelatedNodes)
    .forEach((_node) => {
      const parent = _node.getParent();
      const parentKind = parent && parent.getKindName();
      const kind = _node.getKindName();
      const extra = getExtra(node);
      getNodeRangesForMonaco(_node, lines).forEach((r) => {
        _classifications.push({
          ...r,
          kind,
          parentKind,
          extra,
        });
      });
    });
}

function getExtra(node: Node) {
  const extras: string[] = [];
  if (TypeGuards.isJsxTagNamedNode(node)) {
    extras.push(
      node
        .getTagNameNode()
        .getText()
        .match(/^[a-z]/)
        ? 'JSXIntrinsicElement'
        : 'JSXNonIntrinsicElement'
    );
  }
  const parent = node.getParent();
  if (parent && TypeGuards.isJsxTagNamedNode(parent)) {
    extras.push(
      parent
        .getTagNameNode()
        .getText()
        .match(/^[a-z]/)
        ? 'JSXIntrinsicElementChild'
        : 'JSXNonIntrinsicElementChild'
    );
  }
  return extras.length ? extras : undefined;
}

function getNodeRangesForMonaco(node: Node, lines: number[]) {
  return getParentRanges(node).map(({ start, end }) => {
    const { offset, line: startLineNumber } = getLineNumberAndOffset(start, lines);
    const { line: endLineNumber } = getLineNumberAndOffset(end, lines);
    return {
      startLineNumber,
      // Heads up : following sum fixes an error of original implementation when JSXText has multiple lines:
      endLineNumber: endLineNumber + (TypeGuards.isJsxText(node) && node.getText().includes('\n') ? -1 : 0),
      startColumn: start + 1 - offset,
      endColumn: end + 1 - offset,
    };
  });
}
function getLineNumberAndOffset(start: number, lines: number[]) {
  let line = 0;
  let offset = 0;
  while (offset + lines[line] < start) {
    offset += lines[line] + 1;
    line += 1;
  }
  return { line: line + 1, offset };
}
function getParentRanges(node: Node) {
  const ranges: any[] = [];
  const [start, end] = [node.getStart(), node.getEnd()];
  let lastEnd = start;
  node.forEachChild((child) => {
    const [_start, _end] = [child.getStart(), child.getEnd()];
    ranges.push({
      start: lastEnd,
      end: _start,
    });
    lastEnd = _end;
  });
  if (lastEnd !== end) {
    ranges.push({
      start: lastEnd,
      end,
    });
  }
  return ranges;
}

// function getNodeRangeForMonaco(node: Node, lines: number[]){
//   return {
//     startColumn: node.getStartLinePos()+1,//  n.getst ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getStart()).character + 1,
//     startLineNumber: node.getStartLineNumber()+1,
//     endColumn: ts.getLineAndCharacterOfPosition(node.getSourceFile().compilerNode, node.compilerNode.getEnd()).character + 1,
//     endLineNumber: node.getEndLineNumber()+1////ts.getLineAndCharacterOfPosition(n.getSourceFile().compilerNode, n.compilerNode.getEnd()).line + 1,
//   }
// }
// function getNodeRangesForMonaco2(node: Node, lines: number[]){
//   return [getNodeRangeForMonaco(node, lines)]
//   // const ranges:any[] = []
//   // node.forEachChild(child=>{
//   //   ranges.push(getNodeRangeForMonaco(child, lines))
//   // })
//   // return ranges
// }
