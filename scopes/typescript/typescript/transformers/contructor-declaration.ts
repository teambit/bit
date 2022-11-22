import ts, { Node, ConstructorDeclaration } from 'typescript';
import { ConstructorSchema, ParameterSchema, ThisTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class ConstructorDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Constructor;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: ConstructorDeclaration, context: SchemaExtractorContext) {
    const args = await pMapSeries(node.parameters, async (param) => context.computeSchema(param));
    const info = await context.getQuickInfo(node);
    const displaySig = info?.body?.displayString;

    const returns = new ThisTypeSchema(context.getLocation(node.parent));

    return new ConstructorSchema(context.getLocation(node), args as ParameterSchema[], returns, displaySig);
  }
}
