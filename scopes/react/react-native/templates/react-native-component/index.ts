import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';
import { indexFile } from './files/index';

export const reactNativeComponent: ComponentTemplate = {
  name: 'react-native',
  description: 'a basic react native component',
  generateFiles: (context: ComponentContext) => {
    return [indexFile(context), componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
  config: {
    'teambit.react/react-native': {},
    'teambit.envs/envs': {
      env: 'teambit.react/react-native',
    },
  },
};
