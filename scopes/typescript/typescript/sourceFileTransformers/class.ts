import ts from 'typescript';
import { replaceName } from './replaceName';

export function classNamesTransformer(nameMapping: Record<string, string>): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    const { factory } = context;

    const visit: ts.Visitor = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const oldName = node.name.text;
        const newName = replaceName(oldName, nameMapping);

        if (newName) {
          const updatedMembers = node.members.map((member) => {
            if (ts.isPropertyDeclaration(member)) {
              const oldMemberName = member.name.getText();
              const newMemberName = replaceName(oldMemberName, nameMapping);
              return factory.updatePropertyDeclaration(
                member,
                member.modifiers,
                newMemberName ? ts.factory.createIdentifier(newMemberName) : member.name,
                member.questionToken,
                member.type,
                member.initializer
              );
            }

            if (ts.isMethodDeclaration(member)) {
              const oldMemberName = member.name.getText();
              const newMemberName = replaceName(oldMemberName, nameMapping);

              const updatedParameters = member.parameters.map((param) => {
                return ts.factory.updateParameterDeclaration(
                  param,
                  param.modifiers,
                  param.dotDotDotToken,
                  param.name,
                  param.questionToken,
                  param.type,
                  param.initializer
                );
              });

              return factory.updateMethodDeclaration(
                member,
                member.modifiers,
                member.asteriskToken,
                newMemberName ? ts.factory.createIdentifier(newMemberName) : member.name,
                member.questionToken,
                member.typeParameters,
                updatedParameters,
                member.type,
                member.body
              );
            }
            return member;
          });

          return factory.updateClassDeclaration(
            node,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.heritageClauses,
            updatedMembers
          );
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}
