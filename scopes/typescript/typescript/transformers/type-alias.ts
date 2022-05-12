import ts, { Node, TypeAliasDeclaration } from 'typescript';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TypeAliasTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeAliasDeclaration;
  }

  async getIdentifiers(node: TypeAliasDeclaration) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  private getName(node: TypeAliasDeclaration): string {
    return node.name.getText();
  }

  async transform(typeAlias: TypeAliasDeclaration, context: SchemaExtractorContext) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(typeAlias.name!);
    const displaySig = info?.body?.displayString;
    const type = await context.computeSchema(typeAlias.type);
    return new TypeSchema(this.getName(typeAlias), type, displaySig as string);
  }
}
