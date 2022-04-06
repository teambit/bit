import ts, { Node } from 'typescript';
import { Component } from '@teambit/component';

export class TransformerNotFound extends Error {
  constructor(readonly node: Node, readonly component: Component) {
    super(
      `typescript: could not find schema transformer for node of kind ${node.kind} (${
        ts.SyntaxKind[node.kind]
      }) in component ${component.id.toString()}`
    );
  }
}
