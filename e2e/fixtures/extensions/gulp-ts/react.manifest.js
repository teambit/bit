const { ScriptsExt } = require('bit-bin/extensions/scripts');

module.exports = {
  name: 'extensions/gulp-ts',
  dependencies: [ScriptsExt],
  config: {},
  provider: async (config, [scripts]) => {
    scripts.register({ name: 'extensions/gulp-ts' }, './transpile');
    return {};
  }
};
