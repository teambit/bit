import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';

export const reactComponentJS: ComponentTemplate = {
  name: 'react-js',
  description: 'a basic react component in js',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.js',
      content: `export { ${Name} } from './${name}';
`,
    };
    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
  config: {
    'teambit.react/react': {},
    'teambit.envs/envs': {
      env: 'teambit.react/react',
    },
  },
};

export const deprecatedReactComponentJS: ComponentTemplate = {
  ...reactComponentJS,
  name: 'react-component-js',
  hidden: true,
};
