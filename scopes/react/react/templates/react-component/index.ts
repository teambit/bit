import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';
import { indexFile } from './files/index-file';

export const reactComponent: ComponentTemplate = {
  name: 'react',
  description: 'a basic react component',
  generateFiles: (context: ComponentContext) => {
    return [indexFile(context), componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
  config: {
    'teambit.react/react': {},
    'teambit.envs/envs': {
      env: 'teambit.react/react',
    },
  },
};

export const deprecatedReactComponent: ComponentTemplate = {
  ...reactComponent,
  name: 'react-component',
  hidden: true,
};
