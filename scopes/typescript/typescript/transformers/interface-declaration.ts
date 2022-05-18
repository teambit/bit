import ts, { Node, InterfaceDeclaration } from 'typescript';
import pMapSeries from 'p-map-series';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class InterfaceDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.InterfaceDeclaration;
  }

  async getIdentifiers(node: InterfaceDeclaration): Promise<ExportIdentifier[]> {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(interfaceDec: InterfaceDeclaration, context: SchemaExtractorContext) {
    const members = await pMapSeries(interfaceDec.members, async (member) => {
      const typeSchema = await context.computeSchema(member);
      return typeSchema;
    });
    return new InterfaceSchema(context.getLocation(interfaceDec), interfaceDec.name.getText(), members);
  }
}
