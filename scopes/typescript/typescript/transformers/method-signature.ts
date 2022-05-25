import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, MethodSignature as MethodSignatureNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { toFunctionLikeSchema } from './utils/to-function-schema';

export class MethodSignatureTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.MethodSignature;
  }

  getName(node: MethodSignatureNode) {
    return node.name.getText();
  }

  async getIdentifiers() {
    return [];
  }

  async transform(methodSig: MethodSignatureNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    return toFunctionLikeSchema(methodSig, context);
  }
}
