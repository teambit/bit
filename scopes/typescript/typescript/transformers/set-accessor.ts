import type { Node, SetAccessorDeclaration } from 'typescript';
import ts from 'typescript';
import type { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class SetAccessorTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.SetAccessor;
  }

  async getIdentifiers(): Promise<Identifier[]> {
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
