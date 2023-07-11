import ts from 'typescript';
import { SourceFileTransformer } from '.';

export const identifierTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isIdentifier(node)) {
        const identifierName = node.text;
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
