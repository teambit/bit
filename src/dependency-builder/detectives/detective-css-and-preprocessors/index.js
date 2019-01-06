// forked and changed from https://github.com/dependents/node-detective-sass

const Walker = require('node-source-walk');
const parser = require('@teambit/gonzales-pe');

/**
 * Extract the @import statements from a given file's content
 *
 * @param  {String} fileContent
 * @param  {String} syntax, can be one of the following: css, less, sass, scss.
 * @return {String[]}
 */
module.exports = function detective(fileContent, syntax) {
  const debug = require('debug')(`detective-${syntax}`);
  debug(`parsing ${syntax} syntax`);
  if (typeof fileContent === 'undefined') {
    throw new Error('content not given');
  }
  if (typeof fileContent !== 'string') {
    throw new Error('content is not a string');
  }

  let dependencies = [];
  let ast;

  try {
    // debug('content: ' + fileContent);
    ast = parser.parse(fileContent, { syntax });
  } catch (e) {
    debug('parse error: ', e.message);
    throw new Error(e.message);
  }

  detective.ast = ast;

  const walker = new Walker();

  walker.walk(ast, function (node) {
    if (!isImportStatement(node)) {
      return;
    }

    dependencies = dependencies.concat(extractDependencies(node));
  });

  return dependencies;
};

function isImportStatement(node) {
  if (!node || node.type !== 'atrule') {
    return false;
  }
  if (!node.content.length || node.content[0].type !== 'atkeyword') {
    return false;
  }

  const atKeyword = node.content[0];

  if (!atKeyword.content.length) {
    return false;
  }

  const importKeyword = atKeyword.content[0];

  if (importKeyword.type !== 'ident' || importKeyword.content !== 'import') {
    return false;
  }

  return true;
}

function extractDependencies(importStatementNode) {
  return importStatementNode.content
    .filter(function (innerNode) {
      return innerNode.type === 'string' || innerNode.type === 'ident';
    })
    .map(function (identifierNode) {
      return identifierNode.content.replace(/["']/g, '');
    });
}
