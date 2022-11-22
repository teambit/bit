import ts, { Node, InterfaceDeclaration, SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import {
  ExpressionWithTypeArgumentsSchema,
  InterfaceSchema,
  UnresolvedSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class InterfaceDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.InterfaceDeclaration;
  }

  async getIdentifiers(node: InterfaceDeclaration): Promise<ExportIdentifier[]> {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  private async getExpressionWithTypeArgs(node: InterfaceDeclaration, context: SchemaExtractorContext) {
    if (!node.heritageClauses) return [];

    return pMapSeries(
      node.heritageClauses
        .filter((heritageClause: ts.HeritageClause) => heritageClause.token === SyntaxKind.ExtendsKeyword)
        .flatMap((h: ts.HeritageClause) => {
          const { types } = h;
          const name = h.getText();
          return types.map((type) => ({ ...type, name }));
        }),
      async (expressionWithTypeArgs: ts.ExpressionWithTypeArguments & { name: string }) => {
        const { typeArguments, expression, name } = expressionWithTypeArgs;
        const typeArgsNodes = typeArguments ? await pMapSeries(typeArguments, (t) => context.computeSchema(t)) : [];
        const location = context.getLocation(expression);
        const expressionNode =
          (await context.visitDefinition(expression)) || new UnresolvedSchema(location, expression.getText());
        return new ExpressionWithTypeArgumentsSchema(typeArgsNodes, expressionNode, name, location);
      }
    );
  }

  async transform(interfaceDec: InterfaceDeclaration, context: SchemaExtractorContext) {
    const members = await pMapSeries(interfaceDec.members, (member) => context.computeSchema(member));
    const doc = await context.jsDocToDocSchema(interfaceDec);
    const signature = interfaceDec.name ? await context.getQuickInfoDisplayString(interfaceDec.name) : undefined;
    const extendsNodes = await this.getExpressionWithTypeArgs(interfaceDec, context);
    const typeParameters = interfaceDec.typeParameters?.map((typeParam) => {
      return typeParam.name.getText();
    });

    if (!signature) {
      throw Error(`Missing signature for interface ${interfaceDec.name.getText()} declaration`);
    }

    return new InterfaceSchema(
      context.getLocation(interfaceDec),
      interfaceDec.name.getText(),
      signature,
      extendsNodes,
      members,
      doc,
      typeParameters
    );
  }
}
