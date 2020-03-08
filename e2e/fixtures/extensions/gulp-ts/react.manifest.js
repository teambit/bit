const { Scripts } = require('bit-bin/extensions/scripts');
const { CreateExt } = require('bit-bin/extensions/create');

module.exports = {
  name: 'extensions/gulp-ts',
  dependencies: [Scripts, CreateExt],
  provider: async (config, [scripts, create]) => {
    scripts.register({ name: 'extensions/gulp-ts' }, './transpile');
    create.register({ name: 'extensions/gulp-ts' }, getTemplates);
    return {};
  }
};

function getTemplates(name) {
  return {
    files: [
      { path: `${name}.js`, content: `export default function ${name}() { console.log('hello gulp-ts'); }` },
      { path: `${name}.spec.js`, content: `export default function ${name}() { console.log('hello gulp-ts test'); }` }
    ],
    main: `${name}.js`
  };
}
