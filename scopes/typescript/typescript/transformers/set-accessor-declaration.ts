import ts, { Node, SetAccessorDeclaration } from 'typescript';
import { ParameterSchema, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class SetAccessorDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.SetAccessor;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: SetAccessorDeclaration, context: SchemaExtractorContext) {
    const params = (await pMapSeries(node.parameters, async (param) =>
      context.computeSchema(param)
    )) as ParameterSchema[];

    const displaySig = await context.getQuickInfoDisplayString(node.name);
    return new SetAccessorSchema(context.getLocation(node), node.name.getText(), params[0], displaySig);
  }
}
