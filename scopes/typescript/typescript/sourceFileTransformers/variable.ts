import ts from 'typescript';
import { replaceName } from './replaceName';

export function variableNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isVariableDeclaration(node) && node.name.kind === ts.SyntaxKind.Identifier) {
        const oldName = node.name.text;
        const newName = replaceName(oldName, nameMapping);
        if (newName) {
          return factory.updateVariableDeclaration(
            node,
            factory.createIdentifier(newName),
            node.exclamationToken,
            node.type,
            node.initializer
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}
