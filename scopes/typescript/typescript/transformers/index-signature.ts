import ts, { Node, IndexSignatureDeclaration } from 'typescript';
import { IndexSignatureSchema, ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class IndexSignatureTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.IndexSignature;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: IndexSignatureDeclaration, context: SchemaExtractorContext) {
    const params = (await pMapSeries(node.parameters, async (param) =>
      context.computeSchema(param)
    )) as ParameterSchema[];
    const type = await context.computeSchema(node.type);
    return new IndexSignatureSchema(context.getLocation(node), params, type);
  }
}
