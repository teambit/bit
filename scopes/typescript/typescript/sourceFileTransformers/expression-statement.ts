import ts from 'typescript';
import { SourceFileTransformer } from '.';

export const expressionStatementTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isExpressionStatement(node)) {
        const identifierName = node.getText();
        let newIdentifierName = mapping[identifierName] || identifierName;

        for (const [oldName, newName] of Object.entries(mapping)) {
          if (identifierName.startsWith(oldName) || identifierName.endsWith(oldName)) {
            newIdentifierName = identifierName.replace(oldName, newName);
          }
        }

        return ts.factory.createIdentifier(newIdentifierName);
      }

      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit);
  };
};
