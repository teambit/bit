import ts, { Node, EnumDeclaration } from 'typescript';
import { EnumMemberSchema, EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class EnumDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.EnumDeclaration;
  }

  async getIdentifiers(node: EnumDeclaration): Promise<Identifier[]> {
    return [new Identifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(enumDec: EnumDeclaration, context: SchemaExtractorContext) {
    const name = enumDec.name.getText();
    const members = await pMapSeries(enumDec.members, async (member) => {
      const memberName = member.name.getText();
      const memberSignature = await context.getQuickInfoDisplayString(member);
      const memberDoc = await context.jsDocToDocSchema(member);
      const memberLocation = await context.getLocation(member);
      const memberValue = member.initializer?.getText();
      return new EnumMemberSchema(memberLocation, memberName, memberSignature, memberValue, memberDoc);
    });
    const signature = await context.getQuickInfoDisplayString(enumDec.name);
    const doc = await context.jsDocToDocSchema(enumDec);
    return new EnumSchema(context.getLocation(enumDec), name, members, signature, doc);
  }
}
