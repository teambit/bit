const stylable = require('stylable');

module.exports = function (src, options = {}) {
  const css = stylable.safeParse(src);
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

  css.walkRules((rule) => {
    const stFrom = rule.nodes.find(node => node.prop === '-st-from');
    if (!stFrom) return;
    const stFromValue = stFrom.value.replace(/["']/g, '');
    addDependency(stFromValue);
    const stNamed = rule.nodes.find(node => node.prop === '-st-named');
    if (!stNamed) return;
    const specifierValue = {
      isDefault: false, // @todo,
      name: stNamed.value,
      exported: true
    };
    addImportSpecifier(stFromValue, specifierValue);
  });

  return dependencies;
};
