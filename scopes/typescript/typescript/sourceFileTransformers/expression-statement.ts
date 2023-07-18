import ts from 'typescript';
import { SourceFileTransformer } from '.';

export const expressionStatementTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isExpressionStatement(node)) {
        return ts.factory.updateExpressionStatement(node, ts.visitNode(node.expression, visit));
      }

      if (ts.isCallExpression(node)) {
        return ts.factory.updateCallExpression(
          node,
          ts.visitNode(node.expression, visit),
          node.typeArguments,
          node.arguments.map((arg) => ts.visitNode(arg, visit))
        );
      }

      if (ts.isPropertyAccessExpression(node)) {
        return ts.factory.updatePropertyAccessExpression(
          node,
          ts.visitNode(node.expression, visit),
          typeof mapping[node.name.text] === 'string' ? ts.factory.createIdentifier(mapping[node.name.text]) : node.name
        );
      }

      if (ts.isIdentifier(node)) {
        return typeof mapping[node.text] === 'string' ? ts.factory.createIdentifier(mapping[node.text]) : node;
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit);
  };
};
