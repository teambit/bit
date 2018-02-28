const fs = require('fs');
const compiler = require('vue-template-compiler');
const flatten = require('lodash.flatten');

module.exports = function(src, options = {}) {
  const precinct = require('../../precinct');
  options.useContent = true;
  options.es6 = { mixedImports : true };
  const { script, styles } = compiler.parseComponent(src, { pad: 'line' });
  const scriptDependencies  = script ? precinct(script.content, options ).map(dep => ({ isScript: true, dep })) : [];
  const styleDependencies  = script ? flatten(styles.map(style => precinct(style.content, { type: style.lang || 'scss' } ).map(dep => ({ isScript: false , dep })))): [];
  return scriptDependencies.concat(styleDependencies);
};