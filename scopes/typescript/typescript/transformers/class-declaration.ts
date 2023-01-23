import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import {
  ClassSchema,
  UnresolvedSchema,
  ExpressionWithTypeArgumentsSchema,
} from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ClassDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ClassDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ClassDeclaration;
  }

  // @todo: in case of `export default class` the class has no name.
  private getName(node: ClassDeclaration) {
    return node.name?.getText() || 'default';
  }

  async getIdentifiers(node: ClassDeclaration) {
    return [new Identifier(this.getName(node), node.getSourceFile().fileName)];
  }

  private async getExpressionWithTypeArgs(
    node: ClassDeclaration,
    context: SchemaExtractorContext,
    token: ts.SyntaxKind.ExtendsKeyword | ts.SyntaxKind.ImplementsKeyword
  ) {
    if (!node.heritageClauses) return [];

    return pMapSeries(
      node.heritageClauses
        .filter((heritageClause: ts.HeritageClause) => heritageClause.token === token)
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

  async transform(node: ClassDeclaration, context: SchemaExtractorContext) {
    const className = this.getName(node);
    const extendsExpressionsWithTypeArgs = await this.getExpressionWithTypeArgs(
      node,
      context,
      ts.SyntaxKind.ExtendsKeyword
    );

    const implementsExpressionsWithTypeArgs = await this.getExpressionWithTypeArgs(
      node,
      context,
      ts.SyntaxKind.ImplementsKeyword
    );

    const typeParameters = node.typeParameters?.map((typeParam) => {
      return typeParam.name.getText();
    });
    const signature = node.name ? await context.getQuickInfoDisplayString(node.name) : undefined;
    const members = await pMapSeries(node.members, async (member) => {
      const isPrivate = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
      if (isPrivate) {
        return null;
      }
      return context.computeSchema(member);
    });
    const doc = await context.jsDocToDocSchema(node);

    if (!signature) {
      throw Error(`Missing signature for class ${className} declaration`);
    }

    return new ClassSchema(
      className,
      compact(members),
      context.getLocation(node),
      signature,
      doc,
      typeParameters,
      extendsExpressionsWithTypeArgs,
      implementsExpressionsWithTypeArgs
    );
  }
}
