import ts from 'typescript';
import { SourceFileTransformer } from '.';

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
            let newElementName = element.name.text;

            for (const [oldName, newName] of Object.entries(mapping)) {
              if (newElementName.startsWith(oldName) || newElementName.endsWith(oldName)) {
                newElementName = newElementName.replace(oldName, newName);
              }
            }

            return ts.factory.updateImportSpecifier(
              element,
              false,
              element.propertyName ? ts.factory.createIdentifier(newElementName) : undefined,
              ts.factory.createIdentifier(newElementName)
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

// export const importTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
//     return (context) => {
//         const visit: ts.Visitor = (node) => {
//             if (ts.isImportDeclaration(node)) {
//                 let moduleSpecifier = node.moduleSpecifier.getText().slice(1, -1);
//                 for (const [oldName, newName] of Object.entries(mapping)) {
//                     if (moduleSpecifier.includes(oldName)) {
//                         moduleSpecifier = moduleSpecifier.replace(oldName, newName);
//                     }
//                 }

//                 if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
//                     const transformedBindings = node.importClause.namedBindings.elements.map((element) => {
//                         let newElementName = element.name.text

//                         for (const [oldName, newName] of Object.entries(mapping)) {
//                             if (newElementName.startsWith(oldName) || newElementName.endsWith(oldName)) {
//                                 newElementName = newElementName.replace(oldName, newName);
//                             }
//                         }

//                         return ts.factory.updateImportSpecifier(
//                             element,
//                             false,
//                             element.propertyName ? ts.factory.createIdentifier(newElementName) : undefined,
//                             ts.factory.createIdentifier(newElementName)
//                         );
//                     });
//                     const updatedImportClause = ts.factory.updateImportClause(
//                         node.importClause,
//                         node.importClause.isTypeOnly,
//                         node.importClause.name,
//                         ts.factory.createNamedImports(transformedBindings)
//                     );

//                     return ts.factory.updateImportDeclaration(
//                         node,
//                         node.decorators,
//                         node.modifiers,
//                         updatedImportClause,
//                         ts.factory.createStringLiteral(moduleSpecifier),
//                         undefined
//                     );
//                 }

//                 return ts.factory.updateImportDeclaration(
//                     node,
//                     node.decorators,
//                     node.modifiers,
//                     node.importClause,
//                     ts.factory.createStringLiteral(moduleSpecifier),
//                     undefined
//                 );
//             }
//             return ts.visitEachChild(node, visit, context);
//         };
//         return (node) => ts.visitNode(node, visit);
//     };
// };
