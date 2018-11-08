/**
 * this file had been forked from https://github.com/pahen/detective-typescript
 */

const Parser = require('typescript-eslint-parser');
const Walker = require('node-source-walk');

/**
 * Extracts the dependencies of the supplied TypeScript module
 *
 * @param  {String|Object} src - File's content or AST
 * @param  {Object} options - options to pass to the parser
 * @return {String[]}
 */
module.exports = function (src, options = {}) {
  options.parser = Parser;

  const walker = new Walker(options);

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
          addDependency(node.source.value);
        }
        break;
      case 'TSExternalModuleReference':
        if (node.expression && node.expression.value) {
          addDependency(node.expression.value);
        }
        break;
      case 'CallExpression':
        if (node.callee.type === 'Import' && node.arguments.length) {
          addDependency(node.arguments[0].value);
        }
        if (
          node.callee.type === 'Identifier' && // taken from detective-cjs
          node.callee.name === 'require' &&
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
