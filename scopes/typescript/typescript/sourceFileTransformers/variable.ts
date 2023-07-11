import ts from 'typescript';

export function variableNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isVariableDeclaration(node) && node.name.kind === ts.SyntaxKind.Identifier) {
        const oldName = node.name.text;
        const newName = Object.keys(nameMapping).find((key) => oldName.startsWith(key) || oldName.endsWith(key));
        if (newName) {
          const replacedName = oldName.startsWith(newName)
            ? oldName.replace(newName, nameMapping[newName])
            : oldName.replace(new RegExp(`${newName}$`), nameMapping[newName]);

          return factory.updateVariableDeclaration(
            node,
            factory.createIdentifier(replacedName),
            node.exclamationToken,
            node.type,
            node.initializer
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit);
  };
}
