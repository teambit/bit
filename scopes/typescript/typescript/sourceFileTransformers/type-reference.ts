import ts from 'typescript';
import { replaceName } from './replaceName';

export function typeReferenceTransformer(mapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isTypeReferenceNode(node)) {
        const oldName = node.typeName.getText();
        const newName = replaceName(oldName, mapping);
        if (newName) {
          return ts.factory.updateTypeReferenceNode(node, ts.factory.createIdentifier(newName), node.typeArguments);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}
