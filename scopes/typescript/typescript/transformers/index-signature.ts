import { SchemaNode, IndexSignatureSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, IndexSignatureDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { getParams } from './utils/get-params';

export class IndexSignature implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.IndexSignature;
  }

  async getIdentifiers() {
    return [];
  }

  async transform(indexSig: IndexSignatureDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    const params = await getParams(indexSig.parameters, context);
    const type = await context.resolveType(indexSig, indexSig.type.getText());
    return new IndexSignatureSchema(params, type);
  }
}
