import { FunctionLikeSchema, ParameterSchema, SchemaNode, Modifier } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, SignatureDeclaration } from 'typescript';
import pMapSeries from 'p-map-series';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

export class FunctionLikeTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.CallSignature ||
      node.kind === ts.SyntaxKind.ConstructSignature ||
      node.kind === ts.SyntaxKind.IndexSignature ||
      node.kind === ts.SyntaxKind.FunctionType
    );
  }

  // need to check for anonymous functions assigned for vars, const and let.
  async getIdentifiers(funcDec: SignatureDeclaration) {
    return [new ExportIdentifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: SignatureDeclaration) {
    if (funcDec.kind === ts.SyntaxKind.ConstructSignature) return 'new';
    return funcDec.name?.getText() || '';
  }

  async transform(node: SignatureDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(node);
    const getQuickInfoFromDefaultModifier = async () => {
      const defaultModifier = node.modifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
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

    const returnType = await context.resolveType(node, returnTypeStr, Boolean(info));
    const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
    const typeParameters = node.typeParameters?.map((typeParam) => typeParam.name.getText());
    const location = context.getLocation(node);
    const doc = await context.jsDocToDocSchema(node);

    return new FunctionLikeSchema(
      location,
      name,
      args,
      returnType,
      displaySig,
      modifiers as Modifier[],
      doc,
      typeParameters
    );
  }
}
