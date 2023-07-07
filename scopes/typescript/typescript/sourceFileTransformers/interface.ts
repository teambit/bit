import ts from 'typescript';

export function interfaceNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const newName = nameMapping[node.name.text];
        if (newName) {
          return factory.updateInterfaceDeclaration(
            node,
            node.decorators,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.heritageClauses,
            node.members
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit);
  };
}
