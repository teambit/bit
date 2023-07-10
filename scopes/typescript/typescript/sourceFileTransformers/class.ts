import ts from 'typescript';

export function classNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const oldName = node.name.text;
        const newName = Object.keys(nameMapping).find((key) => oldName.startsWith(key) || oldName.endsWith(key));
        if (newName) {
          const replacedName = oldName.startsWith(newName)
            ? oldName.replace(newName, nameMapping[newName])
            : oldName.replace(new RegExp(`${newName}$`), nameMapping[newName]);
          return factory.updateClassDeclaration(
            node,
            node.decorators,
            node.modifiers,
            factory.createIdentifier(replacedName),
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
