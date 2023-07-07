import ts from 'typescript';

export function functionNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const newName = nameMapping[node.name.text];
        if (newName) {
          return factory.updateFunctionDeclaration(
            node,
            node.decorators,
            node.modifiers,
            node.asteriskToken,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.parameters,
            node.type,
            node.body
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit);
  };
}
