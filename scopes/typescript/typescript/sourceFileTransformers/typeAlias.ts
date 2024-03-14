import ts from 'typescript';
import { replaceName } from './replaceName';

export function typeAliasNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        const oldName = node.name.text;
        const newName = replaceName(oldName, nameMapping);
        if (newName) {
          return factory.updateTypeAliasDeclaration(
            node,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.type
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}
