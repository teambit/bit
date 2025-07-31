import ts from 'typescript';
import type { SourceFileTransformer } from './index';
import { replaceName } from './replaceName';

export const expressionStatementTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const replaceIdentifierText = (identifier: ts.Identifier) => {
      try {
        if (!identifier || !ts.isIdentifier(identifier)) return identifier;
        const oldName = identifier.getText();
        const newName = replaceName(oldName, mapping);

        if (newName) {
          return ts.factory.createIdentifier(newName);
        }
        return identifier;
      } catch {
        return identifier;
      }
    };

    const visit: ts.Visitor = (node) => {
      if (ts.isExpressionStatement(node)) {
        return ts.factory.updateExpressionStatement(node, ts.visitNode(node.expression, visit) as ts.Expression);
      }

      if (ts.isPropertyAccessExpression(node)) {
        let newName = node.name;
        if (ts.isIdentifier(node.name)) {
          newName = replaceIdentifierText(node.name);
        }
        return ts.factory.updatePropertyAccessExpression(
          node,
          ts.visitNode(node.expression, visit) as ts.Expression,
          newName
        );
      }

      if (ts.isIdentifier(node)) {
        return replaceIdentifierText(node);
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
};
