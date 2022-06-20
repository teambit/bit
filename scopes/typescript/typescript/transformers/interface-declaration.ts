import { Node, InterfaceDeclaration, SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { typeElementToSchema } from './utils/type-element-to-schema';
import { jsDocToDocSchema } from './utils/jsdoc-to-doc-schema';

export class InterfaceDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.InterfaceDeclaration;
  }

  async getIdentifiers(node: InterfaceDeclaration): Promise<ExportIdentifier[]> {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(interfaceDec: InterfaceDeclaration, context: SchemaExtractorContext) {
    const members = await pMapSeries(interfaceDec.members, (member) => typeElementToSchema(member, context));
    const doc = await jsDocToDocSchema(interfaceDec, context);
    return new InterfaceSchema(context.getLocation(interfaceDec), interfaceDec.name.getText(), members, doc);
  }
}
