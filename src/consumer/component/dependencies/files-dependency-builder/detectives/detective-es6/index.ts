import {
  getDependenciesFromCallExpression,
  getDependenciesFromMemberExpression,
  getSpecifierValueForImportDeclaration,
} from '../parser-helper';
/**
 * this file had been forked (and changed since then) from https://github.com/dependents/node-detective-es6
 */

const Walker = require('node-source-walk');

/**
 * Extracts the dependencies of the supplied es6 module
 *
 * @param  {String|Object} src - File's content or AST
 * @return {String[]}
 */
export default function (src) {
  const walker = new Walker();

  const dependencies = {};
  const addDependency = (dependency) => {
    if (!dependencies[dependency]) {
      dependencies[dependency] = {};
    }
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
          const dependency = node.source.value;
          addDependency(dependency);
          if (node.specifiers) {
            // in case of "export * from" there are no node.specifiers
            node.specifiers.forEach((specifier) => {
              const specifierValue = {
                isDefault: !specifier.local || specifier.local.name === 'default', // e.g. export { default as isArray } from './is-array';
                name: specifier.exported.name,
                exported: true,
              };
              addImportSpecifier(dependency, specifierValue);
            });
          }
        } else if (node.specifiers && node.specifiers.length) {
          node.specifiers.forEach((exportSpecifier) => {
            addExportedToImportSpecifier(exportSpecifier.exported.name);
          });
        }
        break;
      case 'ExportDefaultDeclaration':
        addExportedToImportSpecifier(node.declaration.name);
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
      default:
        break;
    }
  });

  return dependencies;
}
