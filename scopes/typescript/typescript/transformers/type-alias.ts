import ts, { Node, TypeAliasDeclaration } from 'typescript';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class TypeAliasTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeAliasDeclaration;
  }

  async getIdentifiers(node: TypeAliasDeclaration) {
    return [new Identifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  private getName(node: TypeAliasDeclaration): string {
    return node.name.getText();
  }

  async transform(typeAlias: TypeAliasDeclaration, context: SchemaExtractorContext) {
    const type = await context.computeSchema(typeAlias.type);
    const displaySig = await context.getQuickInfoDisplayString(typeAlias.name);
    const doc = await context.jsDocToDocSchema(typeAlias);
    return new TypeSchema(context.getLocation(typeAlias), this.getName(typeAlias), type, displaySig, doc);
  }
}
