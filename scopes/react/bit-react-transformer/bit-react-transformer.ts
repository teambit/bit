import type { Visitor, PluginObj, PluginPass } from '@babel/core';
import { readFileSync } from 'fs-extra';
import memoize from 'memoizee';
import type * as types from '@babel/types';
import { fileToBitId as _fileToBitId } from './bit-id-from-pkg-json';
import { isClassComponent, isFunctionComponent } from './helpers';

export type BitReactTransformerOptions = {
  componentFilesPath: string;
};

const COMPONENT_IDENTIFIER = '__bitComponentId';
const PLUGIN_NAME = 'bit-react-transformer';

const fileToBitId = memoize(_fileToBitId, {
  primitive: true, // optimize for strings
});

type Api = {
  types: typeof types;
};

/**
 * the bit babel transformer adds a `componentId` property on React components
 * for showcase and debugging purposes.
 */
export function createBitReactTransformer(api: Api, opts: BitReactTransformerOptions) {
  let componentMap: Record<string, string>;
  function setMap(mapPath: string) {
    try {
      const json = readFileSync(mapPath, 'utf-8');
      componentMap = JSON.parse(json);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('bit-react-transformer: error reading map file ', e);
    }
  }

  function addComponentId(path: any, filePath: string, identifier: string) {
    const componentId = componentMap?.[filePath] || fileToBitId(filePath);
    if (!componentId) return;

    const componentIdStaticProp = api.types.expressionStatement(
      api.types.assignmentExpression(
        '=',
        api.types.memberExpression(api.types.identifier(identifier), api.types.identifier(COMPONENT_IDENTIFIER)),
        api.types.identifier(`'${componentId}'`)
      )
    );

    path.insertAfter(componentIdStaticProp);
  }

  const visitor: Visitor<PluginPass> = {
    FunctionDeclaration(path, state) {
      // if (!isFunctionComponent(path.node.body)) return;
      const name = path.node.id?.name;
      const filename = state.file.opts.filename;
      if (!name || !filename) return;

      addComponentId(path, filename, name);
    },

    VariableDeclarator(path, state) {
      const filename = state.file.opts.filename;
      if (!filename) return;

      const node = path.node;
      if (!node.init) return;
      if (node.id.type !== 'Identifier') return;

      const id = node.id;
      switch (node.init.type) {
        case 'FunctionExpression':
          if (isFunctionComponent(node.init.body)) {
            addComponentId(path.parentPath, filename, id.name);
          }
          break;

        case 'ArrowFunctionExpression':
          addComponentId(path.parentPath, filename, id.name);
          break;

        default:
          break;
      }
    },

    ClassDeclaration(path, state) {
      const filename = state.file.opts.filename;
      if (!filename) return;
      if (!isClassComponent(path.node)) return;

      const name = path.node.id.name;
      addComponentId(path, filename, name);
    },
  };

  const Plugin: PluginObj = {
    name: PLUGIN_NAME,
    visitor,
    // TODO - state type
    pre() {
      const filepath = opts.componentFilesPath;

      if (filepath && !componentMap) setMap(filepath);
    },
    post() {
      // reset memoization, in case of fs changes
      fileToBitId.clear();
    },
  };

  return Plugin;
}
