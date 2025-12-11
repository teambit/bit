import type { Node, ConstructorDeclaration } from 'typescript';
import ts from 'typescript';
import type { ParameterSchema, Modifier } from '@teambit/semantics.entities.semantic-schema';
import { ConstructorSchema, ThisTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

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
    const name = node.parent?.name?.getText() || '';
    const returns = new ThisTypeSchema(context.getLocation(node.parent), name);
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
