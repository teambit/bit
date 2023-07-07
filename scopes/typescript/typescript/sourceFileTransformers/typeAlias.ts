import ts from 'typescript';

export function typeAliasNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        const newName = nameMapping[node.name.text];
        if (newName) {
          return factory.updateTypeAliasDeclaration(
            node,
            node.decorators,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.type
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit);
  };
}
