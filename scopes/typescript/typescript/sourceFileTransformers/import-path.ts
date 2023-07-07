import ts from 'typescript';
import { SourceFileTransformer } from '.';

export const importPathTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        let moduleSpecifier = node.moduleSpecifier.getText().slice(1, -1);
        for (const [oldName, newName] of Object.entries(mapping)) {
          if (moduleSpecifier.includes(oldName)) {
            moduleSpecifier = moduleSpecifier.replace(oldName, newName);
          }
        }
        return ts.factory.updateImportDeclaration(
          node,
          node.decorators,
          node.modifiers,
          node.importClause,
          ts.factory.createStringLiteral(moduleSpecifier),
          undefined
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit);
  };
};
