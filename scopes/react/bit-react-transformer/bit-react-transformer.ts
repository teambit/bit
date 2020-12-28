import * as t from '@babel/types';

export type BitReactTransformer = {};

const COMPONENT_IDENTIFIER = 'componentId';

/**
 * the bit babel transformer adds a `componentId` property on React components
 * for showcase and debugging purposes.
 */
export function createBitReactTransformer({ types: t }) {
  function addComponentId(path: any, filePath: string, identifier: string) {
    const componentIdStaticProp = t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier(identifier), t.identifier(COMPONENT_IDENTIFIER)),
        t.identifier(filePath)
      )
    );

    path.insertAfter(componentIdStaticProp);
  }

  return {
    visitor: {
      FunctionDeclaration(path, state) {
        if (!isFunctionComponent(path.body)) {
          return;
        }
        const name = path.declaration.id.name;
        addComponentId(path, state.file.opts.filename, name);
      },

      VariableDeclarator(path: t.VariableDeclarator, state) {
        if (!path.init) return;
        if (path.id.type !== 'Identifier') return;
        const id = path.id as t.Identifier;
        switch (path.init.type) {
          case 'FunctionExpression':
            const funcExpression = path.init as t.FunctionExpression;
            if (isFunctionComponent(funcExpression.body)) {
              addComponentId(path, state.file.opts.filename, id.name);
            }
            break;

          case 'ArrowFunctionExpression':
            const arrowFuncExpression = path.init as t.ArrowFunctionExpression;
            if (isJsxReturnValid(arrowFuncExpression.body)) {
              addComponentId(path, state.file.opts.filename, id.name);
            }

            const block = path.init.body as t.BlockStatement;
            if (isFunctionComponent(block)) {
              addComponentId(path, state.file.opts.filename, id.name);
            }
            break;
        }
      },

      ClassDeclaration(path, state) {
        if (!isClassComponent(path)) {
          return;
        }
        const name = path.id.name;
        addComponentId(path, state.file.opts.filename, name);
      },
    },
  };
}

function isJsxReturnValid(node?: t.Node) {
  if (!node) return false;
  if (node.type === 'JSXElement') return true;
  if (node.type === 'ArrayExpression') {
    const arrayExp = node as t.ArrayExpression;
    return arrayExp.elements.every((elm) => {
      return elm?.type === 'JSXElement';
    });
  }
}

function isClassComponent(classDec: t.ClassDeclaration) {
  classDec.id.name;
  const renderMethod = classDec.body.body.find((classMember) => {
    if (classMember.type === 'ClassMethod') {
      classMember as t.ClassMethod;
      if (classMember.key.type !== 'Identifier') return false;
      const key = classMember.key as t.Identifier;
      return key.name === 'render';
    }
  }) as t.ClassMethod;

  return doesReturnJsx(renderMethod.body);
}

function isFunctionComponent(block: t.BlockStatement): boolean {
  if (block.type !== 'BlockStatement') return false;
  return doesReturnJsx(block);
}

function doesReturnJsx(block: t.BlockStatement): boolean {
  return !!block.body.find((statement) => {
    return statement.type === 'ReturnStatement' && isJsxReturnValid(statement.argument || undefined);
  });
}
