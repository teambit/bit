import type { Visitor, PluginObj, PluginPass, NodePath } from '@babel/core';
import { readFileSync } from 'fs-extra';
import memoize from 'memoizee';
import type * as Types from '@babel/types'; // @babel/types, not @types/babel!
import { fileToBitId, ComponentMetaData } from './bit-id-from-pkg-json';
import { isClassComponent, isFunctionComponent } from './helpers';

export type BitReactTransformerOptions = {
  componentFilesPath: string;
};

const COMPONENT_META = '__bit_component';
const PLUGIN_NAME = 'bit-react-transformer';

type Api = { types: typeof Types };

/**
 * the bit babel transformer adds a `componentId` property on React components
 * for showcase and debugging purposes.
 */
export function createBitReactTransformer(api: Api, opts: BitReactTransformerOptions) {
  let componentMap: Record<string, ComponentMetaData>;
  const types = api.types as typeof Types;

  function setMap(mapPath: string) {
    try {
      const json = readFileSync(mapPath, 'utf-8');
      componentMap = JSON.parse(json);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('bit-react-transformer: error reading map file ', e);
    }
  }

  const toComponentId = memoize(
    (filePath: string) => {
      return componentMap?.[filePath] || fileToBitId(filePath);
    },
    {
      primitive: true, // optimize for strings
    }
  );

  function addComponentId(path: NodePath<any>, filePath: string, identifier: string) {
    const componentIdStaticProp = types.expressionStatement(
      types.assignmentExpression(
        '=',
        types.memberExpression(types.identifier(identifier), types.identifier(COMPONENT_META)),
        types.identifier(COMPONENT_META)
      )
    );

    path.insertAfter(componentIdStaticProp);
  }

  const visitor: Visitor<PluginPass> = {
    Program(path, state) {
      const filename = state.file.opts.filename;
      if (!filename) {
        path.stop(); // stop traversal
        return;
      }

      const meta = componentMap?.[filename] || fileToBitId(filename);
      if (!meta) {
        path.stop(); // stop traversal
        return;
      }

      const properties = [types.objectProperty(types.identifier('id'), types.stringLiteral(meta.id))];
      if (meta.homepage)
        properties.push(types.objectProperty(types.identifier('homepage'), types.stringLiteral(meta.homepage)));

      const metadataDeceleration = types.variableDeclaration('var', [
        types.variableDeclarator(
          types.identifier(COMPONENT_META),

          types.objectExpression(properties)
        ),
      ]);

      path.unshiftContainer('body', metadataDeceleration);
    },

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
    pre() {
      const filepath = opts.componentFilesPath;
      if (filepath && !componentMap) setMap(filepath);
    },
    post() {
      // reset memoization, in case any file change between runs
      toComponentId.clear();
    },
  };

  return Plugin;
}
