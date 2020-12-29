import * as t from '@babel/types';
import { readFileSync } from 'fs-extra';

export type BitReactTransformer = {};

const COMPONENT_IDENTIFIER = 'componentId';

/**
 * the bit babel transformer adds a `componentId` property on React components
 * for showcase and debugging purposes.
 */
export function createBitReactTransformer({ types: c }) {
  let componentMap;
  function setMap(mapPath?: string) {
    if (!mapPath || componentMap) return;
    const json = readFileSync(mapPath, 'utf-8');
    componentMap = JSON.parse(json);
  }

  function addComponentId(path: any, filePath: string, identifier: string) {
    const componentId = componentMap[filePath];
    if (!componentId) return;
    const componentIdStaticProp = c.expressionStatement(
      c.assignmentExpression(
        '=',
        c.memberExpression(c.identifier(identifier), c.identifier(COMPONENT_IDENTIFIER)),
        t.identifier(`'${componentId}'`)
      )
    );

    path.insertAfter(componentIdStaticProp);
  }

  return {
    visitor: {
      FunctionDeclaration(path, state) {
        setMap(state.opts.componentFilesPath);
        if (!isFunctionComponent(path.node.body)) {
          return;
        }
        const name = path.node.id.name;
        addComponentId(path, state.file.opts.filename, name);
      },

      VariableDeclarator(path, state) {
        setMap(state.opts.componentFilesPath);
        const node = path.node as t.VariableDeclarator;
        if (!node.init) return;
        if (node.id.type !== 'Identifier') return;
        const id = node.id as t.Identifier;
        switch (node.init.type) {
          case 'FunctionExpression':
            path.init as t.FunctionExpression;
            if (isFunctionComponent(node.init.body)) {
              addComponentId(path.parentPath, state.file.opts.filename, id.name);
            }
            break;

          case 'ArrowFunctionExpression':
            node.init as t.ArrowFunctionExpression;
            if (isJsxReturnValid(node.init.body)) {
              addComponentId(path.parentPath, state.file.opts.filename, id.name);
            }

            node.init.body as t.BlockStatement;
            if (isFunctionComponent(node.init.body as any)) {
              addComponentId(path.parentPath, state.file.opts.filename, id.name);
            }
            break;

          default:
            break;
        }
      },

      ClassDeclaration(path, state) {
        setMap(state.opts.componentFilesPath);
        if (!isClassComponent(path.node)) {
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

  return false;
}

function isClassComponent(classDec: t.ClassDeclaration) {
  const renderMethod = classDec.body.body.find((classMember) => {
    if (classMember.type === 'ClassMethod') {
      classMember as t.ClassMethod;
      if (classMember.key.type !== 'Identifier') return false;
      const key = classMember.key as t.Identifier;
      return key.name === 'render';
    }

    return false;
  }) as t.ClassMethod;

  return doesReturnJsx(renderMethod?.body);
}

function isFunctionComponent(block: t.BlockStatement): boolean {
  if (block.type !== 'BlockStatement') return false;
  return doesReturnJsx(block);
}

function doesReturnJsx(block: t.BlockStatement): boolean {
  if (!block) return false;
  return !!block.body.find((statement) => {
    return statement.type === 'ReturnStatement' && isJsxReturnValid(statement.argument || undefined);
  });
}
