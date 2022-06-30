import ts, { Node, EnumDeclaration } from 'typescript';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class EnumDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.EnumDeclaration;
  }

  async getIdentifiers(node: EnumDeclaration): Promise<ExportIdentifier[]> {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(enumDec: EnumDeclaration, context: SchemaExtractorContext) {
    const members = enumDec.members.map((member) => member.name.getText());
    return new EnumSchema(context.getLocation(enumDec), enumDec.name.getText(), members);
  }
}
