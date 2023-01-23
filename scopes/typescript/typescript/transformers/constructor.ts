import ts, { Node, ConstructorDeclaration } from 'typescript';
import {
  ConstructorSchema,
  ParameterSchema,
  ThisTypeSchema,
  Modifier,
} from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ConstructorTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Constructor;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ConstructorDeclaration, context: SchemaExtractorContext) {
    const args = await pMapSeries(node.parameters, async (param) => context.computeSchema(param));
    const info = await context.getQuickInfo(node);
    const displaySig = info?.body?.displayString || '';

    const returns = new ThisTypeSchema(context.getLocation(node.parent));
    const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
    const doc = await context.jsDocToDocSchema(node);

    return new ConstructorSchema(
      context.getLocation(node),
      args as ParameterSchema[],
      returns,
      displaySig,
      modifiers as Modifier[],
      doc
    );
  }
}
