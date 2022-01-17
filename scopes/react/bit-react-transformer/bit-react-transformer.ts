import type { Visitor, PluginObj, PluginPass, NodePath } from '@babel/core';
import { readFileSync } from 'fs-extra';
import memoize from 'memoizee';
import type * as Types from '@babel/types'; // @babel/types, not @types/babel!
import {
  ComponentMeta,
  componentMetaField,
  componentMetaProperties,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { metaFromPackageJson } from './meta-from-pkg-json';
import { isClassComponent, isFunctionComponent } from './helpers';

export type BitReactTransformerOptions = {
  componentFilesPath?: string;
};

const PLUGIN_NAME = 'bit-react-transformer';

type Api = { types: typeof Types };

/**
 * the bit babel transformer adds a `componentId` property on React components
 * for showcase and debugging purposes.
 */
export function createBitReactTransformer(api: Api, opts: BitReactTransformerOptions) {
  let componentMap: Record<string, ComponentMeta>;
  const types = api.types;

  function setMap(mapPath: string) {
    try {
      const json = readFileSync(mapPath, 'utf-8');
      componentMap = JSON.parse(json);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('bit-react-transformer: error reading map file ', e);
    }
  }

  const extractMeta = memoize(
    (filePath: string) => componentMap?.[filePath] || metaFromPackageJson(filePath),
    // optimize for string input:
    { primitive: true }
  );

  function addComponentId(path: NodePath<any>, filePath: string, identifier: string) {
    // add meta property, e.g. `Button.__bit_component = __bit_component;`
    const componentIdStaticProp = types.expressionStatement(
      types.assignmentExpression(
        '=',
        types.memberExpression(types.identifier(identifier), types.identifier(componentMetaField)),
        types.identifier(componentMetaField)
      )
    );

    path.insertAfter(componentIdStaticProp);
  }

  const visitor: Visitor<PluginPass> = {
    // visits the start of the file, right after `"use strict"`
    Program(path, state) {
      // // Do not use .stop() or .skip(), it will stop all other babel plugins as well.
      const filename = state.file.opts.filename;
      if (!filename) return;

      const meta = extractMeta(filename);
      if (!meta) return;

      const deceleration = metaToDeceleration(meta, types);

      // inserts to the top of file
      path.unshiftContainer('body', deceleration);
    },

    FunctionDeclaration(path, state) {
      // if (!isFunctionComponent(path.node.body)) return;
      const name = path.node.id?.name;
      const filename = state.file.opts.filename;
      if (!name || !filename || !extractMeta(filename)) return;

      addComponentId(path, filename, name);
    },

    VariableDeclarator(path, state) {
      const filename = state.file.opts.filename;
      if (!filename || !extractMeta(filename)) return;

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

        // handle forwardRef
        case 'CallExpression':
          // direct forwardRef, e.g `const Comp = forwardRef(() => <div>comp</div>);`
          if (node.init.callee.type === 'Identifier' && node.init.callee.name === 'forwardRef')
            addComponentId(path.parentPath, filename, id.name);

          // react.forwardRef, e.g `const Comp = React.forwardRef(() => <div>comp</div>);`
          if (
            node.init.callee.type === 'MemberExpression' &&
            node.init.callee.property.type === 'Identifier' &&
            node.init.callee.property.name === 'forwardRef'
          ) {
            addComponentId(path.parentPath, filename, id.name);
          }

          break;

        default:
          break;
      }
    },

    ClassDeclaration(path, state) {
      const filename = state.file.opts.filename;
      if (!filename || !extractMeta(filename)) return;
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
      // reset memoization, in case any file changes between runs
      extractMeta.clear();
    },
  };

  return Plugin;
}

function metaToDeceleration(meta: ComponentMeta, types: typeof Types) {
  const properties = [
    // e.g. "id": "teambit.base-ui/input/button@0.6.10"
    types.objectProperty(types.identifier(componentMetaProperties.componentId), types.stringLiteral(meta.id)),

    // e.g. "homepage": "https://bit.dev/teambit/base-ui/input/button"
    meta.homepage &&
      types.objectProperty(types.identifier(componentMetaProperties.homepageUrl), types.stringLiteral(meta.homepage)),

    // "exported": true / false
    meta.exported &&
      types.objectProperty(types.identifier(componentMetaProperties.isExported), types.booleanLiteral(meta.exported)),
  ].filter((x) => x) as Types.ObjectProperty[];

  // variable deceleration, e.g. `var __bit_component = { ... };`
  const deceleration = types.variableDeclaration('var', [
    types.variableDeclarator(types.identifier(componentMetaField), types.objectExpression(properties)),
  ]);

  return deceleration;
}
