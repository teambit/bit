// const { CreateExt } = require('bit-bin/extensions/create');
const { getDeclarationCoreExtension } = require('bit-bin');
const CreateExt = getDeclarationCoreExtension('teambit.bit/create');

module.exports = {
  name: 'react-create-template',
  dependencies: [CreateExt],
  provider: async ([create]) => {
    create.register({ name: 'react-create-template' }, getTemplates);
    return {};
  }
};

function getTemplates(name) {
  return {
    files: [
      { path: `${name}.js`, content: `export default function ${name}() { console.log('hello react template'); }` },
      {
        path: `${name}.spec.js`,
        content: `export default function ${name}() { console.log('hello react template test'); }`
      }
    ],
    main: `${name}.js`
  };
}
