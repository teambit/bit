import ts from 'typescript';
import { replaceName } from './replaceName';

export function interfaceNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const oldName = node.name.text;
        const newName = replaceName(oldName, nameMapping);
        if (newName) {
          const newMembers = node.members.map((member) => {
            if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
              const memberName = member.name.text;
              if (nameMapping[memberName]) {
                return factory.updatePropertySignature(
                  member,
                  member.modifiers,
                  factory.createIdentifier(nameMapping[memberName]),
                  member.questionToken,
                  member.type
                );
              }
            }
            return member;
          });
          return factory.updateInterfaceDeclaration(
            node,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.heritageClauses,
            newMembers
          );
        }
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}
