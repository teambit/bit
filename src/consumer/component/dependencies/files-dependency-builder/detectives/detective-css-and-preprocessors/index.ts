// forked and changed from https://github.com/dependents/node-detective-sass
const csstree = require('css-tree');
const isUrl = require('is-url');

/**
 * Extract the @import statements from a given file's content
 *
 * @param  {String} fileContent
 * @param  {String} syntax, can be one of the following: css, less, sass, scss.
 * @return {String[]}
 */
function detective(fileContent, syntax) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const debug = require('debug')(`detective-${syntax}`);
  debug(`parsing ${syntax} syntax`);
  if (typeof fileContent === 'undefined') {
    throw new Error('content not given');
  }
  if (typeof fileContent !== 'string') {
    throw new Error('content is not a string');
  }

  let dependencies = [];

  const ast = csstree.parse(fileContent, {
    onParseError(error) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      handleError(error);
    },
  });

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  detective.ast = ast;

  csstree.walk(ast, function (node) {
    if (!isImportStatement(node)) {
      return;
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dependencies = dependencies.concat(extractDependencies(node, syntax));
    dependencies = clearUrlImports(dependencies);
  });
  return dependencies;
}

function isImportStatement(node) {
  if (node.type === 'Atrule' && node.name === 'import') {
    return true;
  }
  return false;
}

function extractDependencies(importStatementNode) {
  // handle URL import @import url("baz.css");
  if (
    importStatementNode.prelude.type === 'AtrulePrelude' &&
    importStatementNode.prelude.children.tail.data.type === 'Url'
  ) {
    return importStatementNode.prelude.children.tail.data.value.value.replace(/["']/g, '');
  }

  // simple @import
  if (
    importStatementNode.prelude.type === 'AtrulePrelude' &&
    importStatementNode.prelude.children &&
    importStatementNode.prelude.children.tail.data.type !== 'Url'
  ) {
    return importStatementNode.prelude.children.tail.data.value.replace(/["']/g, '');
  }

  // allows imports with no semicolon
  if (importStatementNode.prelude.type === 'Raw' && importStatementNode.prelude.value.includes('@import')) {
    let imports = importStatementNode.prelude.value.split('@import');
    imports = imports.map((imp) => {
      return imp.replace(/["']/g, '').replace(/\n/g, '').replace(/\s/g, '');
    });

    return imports;
  }

  // handles comma-separated imports
  if (importStatementNode.prelude.type === 'Raw' && importStatementNode.prelude.value.includes(',')) {
    importStatementNode.prelude.value = clearLessImportsRules(importStatementNode.prelude.value);
    let imports = importStatementNode.prelude.value.split(',');
    imports = imports.map((imp) => {
      return imp.replace(/["']/g, '').replace(/\n/g, '').replace(/\s/g, '');
    });

    return imports;
  }

  // returns the dependencies of the given .sass file content
  if (importStatementNode.prelude.type === 'Raw') {
    importStatementNode.prelude.value = clearLessImportsRules(importStatementNode.prelude.value);
    return importStatementNode.prelude.value;
  }
  return [];
}

function clearLessImportsRules(importString) {
  // list from http://lesscss.org/features/#import-atrules-feature-import-options
  const lessImportOptions = ['reference', 'inline', 'less', 'css', 'once', 'multiple', 'optional'];
  const toClearSepicalImports = lessImportOptions.some((imp) => {
    if (importString.includes(imp)) {
      return true;
    }
    return false;
  });

  if (toClearSepicalImports) {
    importString = importString.replace(/ *\([^)]*\) */g, '');
  }

  return importString.replace(/["']/g, '').replace(/\n/g, '').replace(/\s/g, '');
}

function clearUrlImports(dependencies) {
  dependencies = dependencies.map((imp) => {
    if (isUrl(imp)) {
      return null;
    }
    return imp;
  });

  return dependencies.filter(Boolean);
}

function handleError() {
  // handle parse error
  return false;
}

export default detective;
