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
module.exports = function (src) {
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
            const specifierValue = {
              isDefault: specifier.type === 'ImportDefaultSpecifier',
              name: specifier.local.name
            };
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
                name: specifier.exported.name
              };
              addImportSpecifier(dependency, specifierValue);
            });
          }
        }
        break;
      case 'CallExpression':
        if (node.callee.type === 'Import' && node.arguments.length && node.arguments[0].value) {
          addDependency(node.arguments[0].value);
        }
        if (
          node.callee.type === 'Identifier' && // taken from detective-cjs
          node.callee.name === 'require' &&
          node.arguments[0].value &&
          node.arguments &&
          node.arguments.length &&
          (node.arguments[0].type === 'Literal' || node.arguments[0].type === 'StringLiteral')
        ) {
          addDependency(node.arguments[0].value);
        }
        break;
      case 'MemberExpression':
        if (
          node.object.type === 'CallExpression' &&
          node.object.callee.type === 'Identifier' &&
          node.object.callee.name === 'require' &&
          node.object.arguments &&
          node.object.arguments.length &&
          node.object.arguments[0].value &&
          (node.object.arguments[0].type === 'Literal' || node.object.arguments[0].type === 'StringLiteral')
        ) {
          const depValue = node.object.arguments[0].value;
          addDependency(depValue);
        }
        break;
      default:
        break;
    }
  });

  return dependencies;
};
