import ts from 'typescript';
import type { SourceFileTransformer } from './index';
import { replaceName } from './replaceName';

export const functionNamesTransformer: SourceFileTransformer = (mapping: Record<string, string>) => {
  return (context) => {
    const updateTypeReference: ts.Visitor = (node) => {
      try {
        if (ts.isTypeReferenceNode(node) && node.typeName) {
          const typeName = node.typeName.getText(node.getSourceFile());
          const newTypeName = replaceName(typeName, mapping);
          if (newTypeName) {
            return ts.factory.updateTypeReferenceNode(
              node,
              ts.factory.createIdentifier(newTypeName),
              node.typeArguments
            );
          }
        }
        return ts.visitEachChild(node, updateTypeReference, context);
      } catch {
        return node;
      }
    };

    const visit: ts.Visitor = (node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const functionName = node.name?.getText() ?? '';
        const newName = Object.entries(mapping).find(([key]) => functionName.includes(key))?.[1] ?? functionName;
        const parameters = node.parameters.map((param) => {
          const newParamType = param.type ? (ts.visitNode(param.type, updateTypeReference) as ts.TypeNode) : param.type;
          if (ts.isIdentifier(param.name)) {
            const oldName = param.name.getText();
            const newParamName = Object.keys(mapping).find((key) => oldName.includes(key));
            if (newParamName) {
              return ts.factory.updateParameterDeclaration(
                param,
                param.modifiers,
                param.dotDotDotToken,
                ts.factory.createIdentifier(newParamName),
                param.questionToken,
                newParamType,
                param.initializer
              );
            }
          } else if (ts.isObjectBindingPattern(param.name)) {
            const elements = param.name.elements.map((element) => {
              const newElementName = mapping[element.name.getText()];
              if (newElementName) {
                return ts.factory.updateBindingElement(
                  element,
                  element.dotDotDotToken,
                  element.propertyName,
                  ts.factory.createIdentifier(newElementName),
                  element.initializer
                );
              }
              return element;
            });
            const newParamName = ts.factory.createObjectBindingPattern(elements);
            return ts.factory.updateParameterDeclaration(
              param,
              param.modifiers,
              param.dotDotDotToken,
              newParamName,
              param.questionToken,
              newParamType,
              param.initializer
            );
          }
          return param;
        });

        if (ts.isFunctionDeclaration(node)) {
          const updatedBody = node.body && ts.isBlock(node.body) ? updateReturnStatement(node.body) : node.body;
          return ts.factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            newName ? ts.factory.createIdentifier(newName) : node.name,
            node.typeParameters,
            parameters,
            node.type,
            updatedBody
          );
        }
        if (ts.isArrowFunction(node)) {
          const updatedBody = node.body && ts.isBlock(node.body) ? updateReturnStatement(node.body) : node.body;
          return ts.factory.updateArrowFunction(
            node,
            node.modifiers,
            node.typeParameters,
            parameters,
            node.type,
            node.equalsGreaterThanToken,
            updatedBody
          );
        }
        if (ts.isFunctionExpression(node)) {
          const updatedBody = node.body && ts.isBlock(node.body) ? updateReturnStatement(node.body) : node.body;
          return ts.factory.updateFunctionExpression(
            node,
            node.modifiers,
            node.asteriskToken,
            newName ? ts.factory.createIdentifier(newName) : node.name,
            node.typeParameters,
            parameters,
            node.type,
            updatedBody
          );
        }
      }
      return ts.visitEachChild(node, visit, context);
    };

    function updateReturnStatement(body: ts.ConciseBody): ts.Block {
      if (ts.isBlock(body)) {
        const updatedStatements: ts.Statement[] = [];
        for (const statement of body.statements) {
          if (ts.isReturnStatement(statement) && statement.expression && ts.isJsxElement(statement.expression)) {
            const jsxElement = statement.expression;
            const openingElement = jsxElement.openingElement;
            const tagName = openingElement.tagName.getText();
            const newTagName = mapping[tagName];
            if (newTagName) {
              const updatedTagName = ts.factory.createIdentifier(newTagName);
              const updatedOpeningElement = ts.factory.updateJsxOpeningElement(
                openingElement,
                updatedTagName,
                openingElement.typeArguments,
                openingElement.attributes
              );
              const updatedClosingElement = jsxElement.closingElement
                ? ts.factory.updateJsxClosingElement(jsxElement.closingElement, updatedTagName)
                : ts.factory.createJsxClosingElement(updatedTagName);
              const updatedJsxElement = ts.factory.createJsxElement(
                updatedOpeningElement,
                jsxElement.children,
                updatedClosingElement
              );
              const updatedStatement = ts.factory.createReturnStatement(updatedJsxElement);
              updatedStatements.push(updatedStatement);
            } else {
              updatedStatements.push(statement);
            }
          } else {
            updatedStatements.push(statement);
          }
        }
        return ts.factory.updateBlock(body, updatedStatements);
      }
      if (
        ts.isExpressionStatement(body) &&
        ts.isReturnStatement(body.expression) &&
        body.expression.expression &&
        ts.isIdentifier(body.expression.expression)
      ) {
        const oldName = body.expression.expression.text;
        const newName = mapping[oldName];
        if (newName) {
          const updatedExpression = ts.factory.createIdentifier(newName);
          const updatedReturnStatement = ts.factory.createReturnStatement(updatedExpression);
          return ts.factory.createBlock([updatedReturnStatement], true);
        }
      }
      return ts.factory.createBlock([], true);
    }
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
};
