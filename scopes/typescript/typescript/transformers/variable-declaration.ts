import {
  SchemaNode,
  VariableLikeSchema,
  FunctionLikeSchema,
  Modifier,
  ParameterSchema,
  TypeRefSchema,
} from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, VariableDeclaration as VariableDeclarationNode, ArrowFunction } from 'typescript';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { Identifier } from '../identifier';
import { ParameterTransformer } from './parameter';

export class VariableDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.VariableDeclaration;
  }

  getName(node: VariableDeclarationNode) {
    return node.name.getText();
  }

  async getIdentifiers(node: VariableDeclarationNode) {
    return [new Identifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(varDec: VariableDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(varDec);
    const info = await context.getQuickInfo(varDec.name);
    const displaySig = info?.body?.displayString || '';
    const location = context.getLocation(varDec);
    const doc = await context.jsDocToDocSchema(varDec);
    const nodeModifiers = ts.canHaveModifiers(varDec) ? ts.getModifiers(varDec) : undefined;
    const modifiers = nodeModifiers?.map((modifier) => modifier.getText()) || [];
    if (varDec.initializer?.kind === ts.SyntaxKind.ArrowFunction) {
      const functionLikeInfo = await context.getQuickInfo((varDec.initializer as ArrowFunction).equalsGreaterThanToken);
      const returnTypeStr = functionLikeInfo ? parseTypeFromQuickInfo(functionLikeInfo) : 'any';
      // example => export const useLanesContext: () => LanesContextModel | undefined = () => {
      if (varDec.type) {
        const funcType = await context.resolveType(varDec, '');
        if (isFunctionLike(funcType)) {
          return new FunctionLikeSchema(
            location,
            name,
            funcType.params,
            funcType.returnType,
            functionLikeInfo?.body?.displayString || '',
            modifiers as Modifier[],
            doc
          );
        }
        // e.g. export const MyComponent: React.FC<T> = ({}) => {}
        if (funcType instanceof TypeRefSchema) {
          const paramTypes = funcType.typeArgs;
          const params = (varDec.initializer as ArrowFunction).parameters;
          const paramsSchema = await pMapSeries(params, async (param, index) => {
            const objectBindingNodes = await ParameterTransformer.getObjectBindingNodes(
              param,
              paramTypes?.[index] ?? funcType,
              context
            );
            return new ParameterSchema(
              location,
              ParameterTransformer.getName(param),
              paramTypes?.[index] ?? funcType,
              Boolean(param.questionToken),
              param.initializer ? param.initializer.getText() : undefined,
              undefined,
              objectBindingNodes,
              Boolean(param.dotDotDotToken)
            );
          });

          return new FunctionLikeSchema(
            location,
            name,
            paramsSchema,
            await context.resolveType(varDec.initializer, returnTypeStr),
            functionLikeInfo?.body?.displayString || '',
            modifiers as Modifier[],
            doc
          );
        }
      }
      const args = (await pMapSeries((varDec.initializer as ArrowFunction).parameters, async (param) =>
        context.computeSchema(param)
      )) as ParameterSchema[];
      return new FunctionLikeSchema(
        location,
        name,
        args,
        await context.resolveType(varDec.initializer, returnTypeStr),
        functionLikeInfo?.body?.displayString || '',
        modifiers as Modifier[],
        doc
      );
    }
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(varDec, typeStr);
    const defaultValue = varDec.initializer ? varDec.initializer.getText() : undefined;

    return new VariableLikeSchema(location, name, displaySig, type, false, doc, defaultValue);
  }
}

function isFunctionLike(node: SchemaNode): node is FunctionLikeSchema {
  return node instanceof FunctionLikeSchema;
}
