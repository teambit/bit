import ts from 'typescript';
import type { SourceFileTransformer } from './index';

export const exportTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isExportDeclaration(node)) {
        let moduleSpecifier = node.moduleSpecifier?.getText().slice(1, -1);
        for (const [oldName, newName] of Object.entries(mapping)) {
          if (moduleSpecifier && moduleSpecifier.includes(oldName)) {
            moduleSpecifier = moduleSpecifier.replace(oldName, newName);
          }
        }
        let updatedExportClause;

        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          const transformedElements = node.exportClause.elements.map((element) => {
            let newElementName = element.name.text;

            for (const [oldName, newName] of Object.entries(mapping)) {
              if (newElementName.startsWith(oldName) || newElementName.endsWith(oldName)) {
                newElementName = newElementName.replace(oldName, newName);
              }
            }

            return ts.factory.updateExportSpecifier(
              element,
              false,
              element.propertyName,
              ts.factory.createIdentifier(newElementName)
            );
          });

          updatedExportClause = ts.factory.updateNamedExports(node.exportClause, transformedElements);
        }

        return ts.factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          updatedExportClause,
          node.moduleSpecifier ? ts.factory.createStringLiteral(moduleSpecifier || '') : undefined,
          undefined
        );
      }

      if (ts.isExportAssignment(node)) {
        let expression = node.expression;

        if (ts.isIdentifier(expression)) {
          for (const [oldName, newName] of Object.entries(mapping)) {
            if (expression.getText().startsWith(oldName) || expression.getText().endsWith(oldName)) {
              expression = ts.factory.createIdentifier(expression.getText().replace(oldName, newName));
            }
          }
        }

        return ts.factory.updateExportAssignment(node, node.modifiers, expression);
      }

      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
};
