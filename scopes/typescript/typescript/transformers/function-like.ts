import type { ParameterSchema, SchemaNode, Modifier } from '@teambit/semantics.entities.semantic-schema';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { Node, SignatureDeclaration } from 'typescript';
import ts from 'typescript';
import pMapSeries from 'p-map-series';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { SchemaTransformer } from '../schema-transformer';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { Identifier } from '../identifier';

export class FunctionLikeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.CallSignature ||
      node.kind === ts.SyntaxKind.ConstructSignature ||
      node.kind === ts.SyntaxKind.FunctionType ||
      node.kind === ts.SyntaxKind.MethodSignature
    );
  }

  // need to check for anonymous functions assigned for vars, const and let.
  async getIdentifiers(funcDec: SignatureDeclaration) {
    return [new Identifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: SignatureDeclaration) {
    if (funcDec.kind === ts.SyntaxKind.ConstructSignature) return 'new';
    return funcDec.name?.getText() || '';
  }

  async transform(node: SignatureDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(node);
    const nodeModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const getQuickInfoFromDefaultModifier = async () => {
      const defaultModifier = nodeModifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (defaultModifier) return context.getQuickInfo(defaultModifier);
      if (node.kind === ts.SyntaxKind.ArrowFunction) return context.getQuickInfo(node.equalsGreaterThanToken);
      return null;
    };
    const info = node.name ? await context.getQuickInfo(node.name) : await getQuickInfoFromDefaultModifier();
    const returnTypeStr = info ? parseTypeFromQuickInfo(info) : 'any';
    const displaySig = info?.body?.displayString || '';
    const args = (await pMapSeries(node.parameters, async (param) =>
      context.computeSchema(param)
    )) as ParameterSchema[];

    const returnType = await context.resolveType(node, returnTypeStr);
    const modifiers = nodeModifiers?.map((modifier) => modifier.getText()) || [];
    const typeParameters = node.typeParameters?.map((typeParam) => typeParam.name.getText());
    const location = context.getLocation(node);
    const doc = await context.jsDocToDocSchema(node);
    const nodeDecorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
    const decorators = nodeDecorators?.length
      ? await pMapSeries(nodeDecorators, (decorator) => context.computeSchema(decorator))
      : undefined;

    return new FunctionLikeSchema(
      location,
      name,
      args,
      returnType,
      displaySig,
      modifiers as Modifier[],
      doc,
      typeParameters,
      decorators
    );
  }
}
