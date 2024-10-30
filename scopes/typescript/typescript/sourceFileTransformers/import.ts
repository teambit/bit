import ts from 'typescript';
import { SourceFileTransformer } from './index';

export const importTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        let moduleSpecifier = node.moduleSpecifier.getText().slice(1, -1);
        for (const [oldName, newName] of Object.entries(mapping)) {
          if (moduleSpecifier.includes(oldName)) {
            moduleSpecifier = moduleSpecifier.replace(oldName, newName);
          }
        }

        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const transformedBindings = node.importClause.namedBindings.elements.map((element) => {
            let originalName = element.propertyName ? element.propertyName.text : element.name.text;
            const aliasName = element.name.text;

            for (const [oldName, newName] of Object.entries(mapping)) {
              if (originalName.startsWith(oldName) || originalName.endsWith(oldName)) {
                originalName = originalName.replace(oldName, newName);
              }
            }

            return ts.factory.updateImportSpecifier(
              element,
              false,
              element.propertyName ? ts.factory.createIdentifier(originalName) : undefined,
              ts.factory.createIdentifier(aliasName)
            );
          });

          const updatedImportClause = ts.factory.updateImportClause(
            node.importClause,
            node.importClause.isTypeOnly,
            node.importClause.name,
            ts.factory.createNamedImports(transformedBindings)
          );

          return ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            updatedImportClause,
            ts.factory.createStringLiteral(moduleSpecifier),
            undefined
          );
        }

        return ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          ts.factory.createStringLiteral(moduleSpecifier),
          undefined
        );
      }
      if (ts.isImportEqualsDeclaration(node)) {
        let moduleSpecifier = node.moduleReference.getText().slice(1, -1);
        for (const [oldName, newName] of Object.entries(mapping)) {
          if (moduleSpecifier.includes(oldName)) {
            moduleSpecifier = moduleSpecifier.replace(oldName, newName);
          }
        }

        const updatedImportEqualsDeclaration = ts.factory.updateImportEqualsDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.name,
          ts.factory.createExternalModuleReference(ts.factory.createStringLiteral(moduleSpecifier))
        );

        return updatedImportEqualsDeclaration;
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const [firstArg] = node.arguments;

        if (ts.isStringLiteral(firstArg)) {
          let moduleSpecifier = firstArg.text;

          for (const [oldName, newName] of Object.entries(mapping)) {
            if (moduleSpecifier.includes(oldName)) {
              moduleSpecifier = moduleSpecifier.replace(oldName, newName);
            }
          }

          const updatedArg = ts.factory.createStringLiteral(moduleSpecifier);
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
            updatedArg,
            ...node.arguments.slice(1),
          ]);
        }
      }

      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
};
