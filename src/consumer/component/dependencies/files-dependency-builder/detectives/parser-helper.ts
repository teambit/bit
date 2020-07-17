export function getDependenciesFromMemberExpression(node) {
  if (
    node.object.type === 'CallExpression' &&
    node.object.callee.type === 'Identifier' &&
    node.object.callee.name === 'require' &&
    node.object.arguments &&
    node.object.arguments.length
  ) {
    return getStringValue(node.object.arguments[0]);
  }
  return null;
}

export function getDependenciesFromCallExpression(node) {
  if (node.callee.type === 'Import' && node.arguments.length && node.arguments[0].value) {
    return node.arguments[0].value;
  }
  if (
    node.callee.type === 'Identifier' && // taken from detective-cjs
    node.callee.name === 'require' &&
    node.arguments &&
    node.arguments.length
  ) {
    return getStringValue(node.arguments[0]);
  }
  return null;
}

export function getSpecifierValueForImportDeclaration(specifier) {
  return {
    isDefault: specifier.type === 'ImportDefaultSpecifier',
    // syntax of `import x from 'file'` doesn't have specifier.imported, only specifier.local
    // syntax of `import { x as y } from 'file'`, has `x` as specifier.imported and `y` as
    // specifier.local. we interested in `x` in this case.
    name: specifier.imported ? specifier.imported.name : specifier.local.name,
  };
}

function getStringValue(node) {
  // using single or double quotes (', ")
  if (node.type === 'Literal' || node.type === 'StringLiteral') {
    return node.value;
  }
  // using apostrophe (`)
  if (
    node.type === 'TemplateLiteral' &&
    node.quasis &&
    node.quasis.length &&
    node.quasis[0].type === 'TemplateElement'
  ) {
    return node.quasis[0].value.raw;
  }
  return null;
}
