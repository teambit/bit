import type { Node, IndexSignatureDeclaration } from 'typescript';
import ts from 'typescript';
import type { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { IndexSignatureSchema, UnresolvedSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class IndexSignatureTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.IndexSignature;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: IndexSignatureDeclaration, context: SchemaExtractorContext) {
    const param = node.parameters[0];
    if (!param) {
      return new UnresolvedSchema(context.getLocation(node), `IndexSignatureTransformer: no parameter found`);
    }
    const keyType = (await context.computeSchema(param)) as ParameterSchema;
    const valueType = await context.computeSchema(node.type);
    return new IndexSignatureSchema(context.getLocation(node), keyType, valueType);
  }
}
