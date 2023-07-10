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

        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const transformedBindings = node.importClause.namedBindings.elements.map((element) => {
            const elementName = element.name.text;
            const newElementName = mapping[elementName] || elementName;

            if (element.propertyName && element.propertyName.text === elementName) {
              return ts.factory.updateImportSpecifier(
                element,
                false,
                element.propertyName,
                ts.factory.createIdentifier(newElementName)
              );
            }
            if (element.name.text === elementName) {
              return ts.factory.updateImportSpecifier(
                element,
                false,
                element.propertyName,
                ts.factory.createIdentifier(newElementName)
              );
            }
            return element;
          });

          const updatedImportClause = ts.factory.updateImportClause(
            node.importClause,
            false,
            node.importClause.name,
            ts.factory.createNamedImports(transformedBindings)
          );

          return ts.factory.updateImportDeclaration(
            node,
            node.decorators,
            node.modifiers,
            updatedImportClause,
            ts.factory.createStringLiteral(moduleSpecifier),
            undefined
          );
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
