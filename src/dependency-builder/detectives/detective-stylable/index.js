const stylable = require('stylable');
module.exports = function(src, options = {}) {
  const css = stylable.safeParse(src);
  const dependencies = [];
  const importSpecifiers = {};

  css.walkRules((rule) => {
    const stFrom = rule.nodes.find(node => node.prop === '-st-from');
    if (!stFrom) return;
    const stFromValue = stFrom.value.replace(/["']/g, '');
    dependencies.push(stFromValue);
    const stNamed = rule.nodes.find(node => node.prop === '-st-named');
    if (!stNamed) return;
    const specifierValue = {
      isDefault: false, // @todo,
      name: stNamed.value
    };
    importSpecifiers[stFromValue]
      ? importSpecifiers[stFromValue].push(specifierValue)
      : importSpecifiers[stFromValue] = [specifierValue];
  });
  options.importSpecifiers = importSpecifiers;

  return dependencies;
};
