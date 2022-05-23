import ts, { Node } from 'typescript';
import { Component } from '@teambit/component';
import { Location } from '@teambit/semantics.entities.semantic-schema';

export class TransformerNotFound extends Error {
  constructor(readonly node: Node, readonly component: Component, location: Location) {
    super(
      `typescript: could not find schema transformer for node of kind ${node.kind} (${
        ts.SyntaxKind[node.kind]
      }) in component ${component.id.toString()}.
location:  ${location.file}, line: ${location.line}, character: ${location.character}.
node-text: ${node.getText()}`
    );
  }
}
