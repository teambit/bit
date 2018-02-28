/**
* this file had been forked from https://github.com/pahen/detective-typescript
*/

var Parser = require('typescript-eslint-parser');
var Walker = require('node-source-walk');

/**
 * Extracts the dependencies of the supplied TypeScript module
 *
 * @param  {String|Object} src - File's content or AST
 * @param  {Object} options - options to pass to the parser
 * @return {String[]}
 */
module.exports = function(src, options = {}) {
  options.parser = Parser;

  var walker = new Walker(options);

  var dependencies = [];

  if (typeof src === 'undefined') {
    throw new Error('src not given');
  }

  if (src === '') {
    return dependencies;
  }

  var importSpecifiers = {};
  walker.walk(src, function(node) {
    switch (node.type) {
      case 'ImportDeclaration':
        if (node.source && node.source.value) {
          dependencies.push(node.source.value);

          node.specifiers.forEach((specifier) => {
            var specifierValue = {
              isDefault: specifier.type === 'ImportDefaultSpecifier',
              name: specifier.local.name
            };
            importSpecifiers[node.source.value]
              ? importSpecifiers[node.source.value].push(specifierValue)
              : importSpecifiers[node.source.value] = [specifierValue];
          });
        }
        break;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source && node.source.value) {
          dependencies.push(node.source.value);
        }
        break;
      case 'TSExternalModuleReference':
        if (node.expression && node.expression.value) {
          dependencies.push(node.expression.value);
        }
        break;
      default:
        return;
    }
  });
  options.importSpecifiers = importSpecifiers;

  return dependencies;
};
