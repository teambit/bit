/**
 * this file had been forked from https://github.com/pahen/detective-typescript
 */
import { isRelativeImport } from '../../../../../../utils';
import {
  getDependenciesFromCallExpression,
  getDependenciesFromMemberExpression,
  getSpecifierValueForImportDeclaration,
} from '../parser-helper';

const Parser = require('@typescript-eslint/typescript-estree');
const Walker = require('node-source-walk');

/**
 * Extracts the dependencies of the supplied TypeScript module
 *
 * @param  {String|Object} src - File's content or AST
 * @param  {Object} options - options to pass to the parser
 * @return {String[]}
 */
export default function (src, options: Record<string, any> = {}) {
  options.parser = Parser;

  const walker = new Walker(options);

  const dependencies = {};
  const addDependency = (dependency) => {
    if (!dependencies[dependency]) {
      dependencies[dependency] = {};
    }
  };
  const addAngularLocalDependency = (dependency) => {
    const angularDep = isRelativeImport(dependency) ? dependency : `./${dependency}`;
    addDependency(angularDep);
  };
  const addImportSpecifier = (dependency, importSpecifier) => {
    if (dependencies[dependency].importSpecifiers) {
      dependencies[dependency].importSpecifiers.push(importSpecifier);
    } else {
      dependencies[dependency].importSpecifiers = [importSpecifier];
    }
  };
  const addExportedToImportSpecifier = (name) => {
    Object.keys(dependencies).forEach((dependency) => {
      if (!dependencies[dependency].importSpecifiers) return;
      const specifier = dependencies[dependency].importSpecifiers.find((i) => i.name === name);
      if (specifier) specifier.exported = true;
    });
  };

  if (typeof src === 'undefined') {
    throw new Error('src not given');
  }

  if (src === '') {
    return dependencies;
  }

  walker.walk(src, function (node) {
    switch (node.type) {
      case 'ImportDeclaration':
        if (node.source && node.source.value) {
          const dependency = node.source.value;
          addDependency(dependency);

          node.specifiers.forEach((specifier) => {
            const specifierValue = getSpecifierValueForImportDeclaration(specifier);
            addImportSpecifier(dependency, specifierValue);
          });
        }
        break;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source && node.source.value) {
          addDependency(node.source.value);
        } else if (node.specifiers && node.specifiers.length) {
          node.specifiers.forEach((exportSpecifier) => {
            addExportedToImportSpecifier(exportSpecifier.exported.name);
          });
        }
        break;
      case 'ExportDefaultDeclaration':
        addExportedToImportSpecifier(node.declaration.name);
        break;
      case 'TSExternalModuleReference':
        if (node.expression && node.expression.value) {
          addDependency(node.expression.value);
        }
        break;
      case 'CallExpression':
        {
          const value = getDependenciesFromCallExpression(node);
          if (value) addDependency(value);
        }
        break;
      case 'MemberExpression':
        {
          const value = getDependenciesFromMemberExpression(node);
          if (value) addDependency(value);
        }
        break;
      case 'Decorator': // parse Angular Decorators to find style/template dependencies
        if (
          node.expression &&
          node.expression.callee &&
          node.expression.callee.name === 'Component' &&
          node.expression.arguments &&
          node.expression.arguments.length &&
          node.expression.arguments[0].type === 'ObjectExpression'
        ) {
          const angularComponent = node.expression.arguments[0].properties;
          angularComponent.forEach((prop) => {
            if (!prop.key || !prop.value) return;
            if (prop.key.name === 'templateUrl' && prop.value.type === 'Literal') {
              addAngularLocalDependency(prop.value.value);
            }
            if (prop.key.name === 'styleUrl' && prop.value.type === 'Literal') {
              addAngularLocalDependency(prop.value.value);
            }
            if (prop.key.name === 'styleUrls' && prop.value.type === 'ArrayExpression') {
              const literalsElements = prop.value.elements.filter((e) => e.type === 'Literal');
              literalsElements.forEach((element) => addAngularLocalDependency(element.value));
            }
          });
        }
        break;
      default:
        break;
    }
  });

  return dependencies;
}
