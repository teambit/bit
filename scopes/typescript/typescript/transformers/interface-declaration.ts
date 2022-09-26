import { Node, InterfaceDeclaration, SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import { InterfaceSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
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
    const signature = interfaceDec.name ? await context.getQuickInfoDisplayString(interfaceDec.name) : undefined;
    const extendsNodes = (
      await pMapSeries(interfaceDec.heritageClauses?.flatMap((h) => h.types) || [], (typeExpression) =>
        context.visitDefinition(typeExpression.expression)
      )
    ).filter((extendNode) => extendNode !== undefined) as SchemaNode[];

    if (!signature) {
      throw Error(`Missing signature for interface ${interfaceDec.name.getText()} declaration`);
    }
    return new InterfaceSchema(
      context.getLocation(interfaceDec),
      interfaceDec.name.getText(),
      signature,
      extendsNodes,
      members,
      doc
    );
  }
}

// console.log(
//   `🚀🚀🚀 ${interfaceDec.name.getText()}\n`,
//   interfaceDec?.heritageClauses?.[0].token,
//   interfaceDec?.heritageClauses?.[0].types.map((t) => t.expression.getText()).join(',')
// );
