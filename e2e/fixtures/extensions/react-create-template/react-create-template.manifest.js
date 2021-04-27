// const { CreateExt } = require('@teambit/legacy/extensions/create');
const { getDeclarationCoreExtension } = require('@teambit/legacy');
const CreateExt = getDeclarationCoreExtension('teambit.generator/create');

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
